create type public.customer_account_movement_type as enum ('charge', 'payment', 'void');

create table public.customer_account_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  customer_id uuid not null references public.customers(id),
  sale_id uuid references public.sales(id) on delete set null,
  type public.customer_account_movement_type not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method public.payment_method,
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((type = 'payment' and payment_method is not null and payment_method <> 'store_credit') or (type <> 'payment' and payment_method is null))
);

create unique index customer_account_sale_charge_idx on public.customer_account_movements (sale_id, type) where sale_id is not null and type in ('charge','void');
create index customer_account_customer_date_idx on public.customer_account_movements (customer_id, created_at desc);
alter table public.customer_account_movements enable row level security;
create policy "customer roles read account movements" on public.customer_account_movements for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','viewer']::public.membership_role[]));

create or replace function public.capture_store_credit_sale()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_sale public.sales%rowtype;
begin
  if new.method <> 'store_credit' then return new; end if;
  select * into target_sale from public.sales where id = new.sale_id;
  if target_sale.customer_id is null then raise exception 'customer required for store credit'; end if;
  insert into public.customer_account_movements (organization_id, location_id, customer_id, sale_id, type, amount, created_by)
  values (target_sale.organization_id, target_sale.location_id, target_sale.customer_id, target_sale.id, 'charge', new.amount, target_sale.cashier_id)
  on conflict (sale_id, type) where sale_id is not null and type in ('charge','void') do nothing;
  return new;
end;
$$;
create trigger payment_store_credit_created after insert on public.payments for each row execute function public.capture_store_credit_sale();

create or replace function public.capture_voided_credit_sale()
returns trigger language plpgsql security definer set search_path = '' as $$
declare charge_amount numeric(14,2);
begin
  if old.status = 'completed' and new.status = 'voided' then
    select amount into charge_amount from public.customer_account_movements where sale_id = new.id and type = 'charge';
    if charge_amount is not null then
      insert into public.customer_account_movements (organization_id, location_id, customer_id, sale_id, type, amount, notes, created_by)
      values (new.organization_id, new.location_id, new.customer_id, new.id, 'void', charge_amount, 'Reversión por anulación de venta', auth.uid())
      on conflict (sale_id, type) where sale_id is not null and type in ('charge','void') do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger sale_credit_voided after update of status on public.sales for each row execute function public.capture_voided_credit_sale();

insert into public.customer_account_movements (organization_id, location_id, customer_id, sale_id, type, amount, created_by, created_at)
select sale.organization_id, sale.location_id, sale.customer_id, sale.id, 'charge', payment.amount, sale.cashier_id, payment.received_at
from public.payments payment join public.sales sale on sale.id = payment.sale_id
where payment.method = 'store_credit' and sale.customer_id is not null
on conflict (sale_id, type) where sale_id is not null and type in ('charge','void') do nothing;
insert into public.customer_account_movements (organization_id, location_id, customer_id, sale_id, type, amount, notes, created_by, created_at)
select charge.organization_id, charge.location_id, charge.customer_id, charge.sale_id, 'void', charge.amount, 'Reversión por anulación de venta', sale.cashier_id, coalesce(sale.updated_at, now())
from public.customer_account_movements charge join public.sales sale on sale.id = charge.sale_id
where charge.type = 'charge' and sale.status = 'voided'
on conflict (sale_id, type) where sale_id is not null and type in ('charge','void') do nothing;

create or replace function public.record_customer_payment(p_customer_id uuid, p_location_id uuid, p_amount numeric, p_method text, p_reference text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_organization_id uuid; current_balance numeric(14,2); movement_id uuid;
begin
  select organization_id into target_organization_id from public.customers where id = p_customer_id and active;
  if target_organization_id is null or not public.has_organization_role(target_organization_id, array['owner','admin','manager','cashier']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and organization_id = target_organization_id and active) then raise exception 'invalid location'; end if;
  if p_amount <= 0 or p_method not in ('cash','card','transfer','other') then raise exception 'invalid payment'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_customer_id::text, 0));
  select coalesce(sum(case type when 'charge' then amount else -amount end),0) into current_balance
  from public.customer_account_movements where customer_id = p_customer_id;
  if current_balance <= 0 or p_amount > current_balance then raise exception 'payment exceeds balance'; end if;
  insert into public.customer_account_movements (organization_id, location_id, customer_id, type, amount, payment_method, reference, notes, created_by)
  values (target_organization_id, p_location_id, p_customer_id, 'payment', p_amount, p_method::public.payment_method, nullif(trim(p_reference),''), nullif(trim(p_notes),''), auth.uid())
  returning id into movement_id;
  return movement_id;
end;
$$;

create or replace function public.close_cash_register(p_session_id uuid, p_closing_amount numeric, p_notes text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare target_session public.cash_register_sessions%rowtype; cash_sales numeric(14,2); credit_collections numeric(14,2); adjustments numeric(14,2); calculated_expected numeric(14,2);
begin
  select * into target_session from public.cash_register_sessions where id = p_session_id and status = 'open' for update;
  if target_session.id is null then raise exception 'register is closed'; end if;
  if target_session.opened_by <> auth.uid() and not public.has_organization_role(target_session.organization_id, array['owner','admin','manager']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if p_closing_amount < 0 then raise exception 'invalid closing amount'; end if;
  select coalesce(sum(payment.amount),0) into cash_sales from public.payments payment join public.sales sale on sale.id = payment.sale_id
  where sale.organization_id = target_session.organization_id and sale.location_id = target_session.location_id and sale.cashier_id = target_session.opened_by and sale.status = 'completed' and sale.completed_at >= target_session.opened_at and sale.completed_at <= now() and payment.method = 'cash';
  select coalesce(sum(amount),0) into credit_collections from public.customer_account_movements
  where organization_id = target_session.organization_id and location_id = target_session.location_id and created_by = target_session.opened_by and type = 'payment' and payment_method = 'cash' and created_at >= target_session.opened_at and created_at <= now();
  select coalesce(sum(case when type = 'deposit' then amount else -amount end),0) into adjustments from public.cash_register_movements where session_id = p_session_id;
  calculated_expected := target_session.opening_amount + cash_sales + credit_collections + adjustments;
  update public.cash_register_sessions set status='closed', expected_amount=calculated_expected, closing_amount=p_closing_amount, difference=p_closing_amount-calculated_expected, closing_notes=nullif(trim(p_notes),''), closed_by=auth.uid(), closed_at=now() where id=p_session_id;
  return p_closing_amount-calculated_expected;
end;
$$;

revoke all on function public.record_customer_payment(uuid, uuid, numeric, text, text, text) from public;
grant execute on function public.record_customer_payment(uuid, uuid, numeric, text, text, text) to authenticated;
