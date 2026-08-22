create type public.register_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('deposit', 'withdrawal');

create table public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  opened_by uuid not null references auth.users(id),
  closed_by uuid references auth.users(id),
  status public.register_status not null default 'open',
  opening_amount numeric(14,2) not null check (opening_amount >= 0),
  expected_amount numeric(14,2),
  closing_amount numeric(14,2),
  difference numeric(14,2),
  opening_notes text,
  closing_notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index cash_register_one_open_idx on public.cash_register_sessions (organization_id, location_id, opened_by) where status = 'open';
create index cash_register_sessions_org_date_idx on public.cash_register_sessions (organization_id, opened_at desc);

create table public.cash_register_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.cash_register_sessions(id) on delete cascade,
  type public.cash_movement_type not null,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cash_register_sessions enable row level security;
alter table public.cash_register_movements enable row level security;
create policy "cash roles read register sessions" on public.cash_register_sessions for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','viewer']::public.membership_role[]) and (opened_by = auth.uid() or public.has_organization_role(organization_id, array['owner','admin','manager','viewer']::public.membership_role[])));
create policy "cash roles read register movements" on public.cash_register_movements for select to authenticated
using (exists (select 1 from public.cash_register_sessions session where session.id = session_id and (session.opened_by = auth.uid() or public.has_organization_role(session.organization_id, array['owner','admin','manager','viewer']::public.membership_role[]))));

create or replace function public.open_cash_register(p_organization_id uuid, p_location_id uuid, p_opening_amount numeric, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_session_id uuid;
begin
  if not public.has_organization_role(p_organization_id, array['owner','admin','manager','cashier']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if p_opening_amount < 0 then raise exception 'invalid opening amount'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and organization_id = p_organization_id and active) then raise exception 'location unavailable'; end if;
  insert into public.cash_register_sessions (organization_id, location_id, opened_by, opening_amount, opening_notes)
  values (p_organization_id, p_location_id, auth.uid(), p_opening_amount, nullif(trim(p_notes), '')) returning id into new_session_id;
  return new_session_id;
end;
$$;

create or replace function public.add_cash_register_movement(p_session_id uuid, p_type public.cash_movement_type, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_session public.cash_register_sessions%rowtype; movement_id uuid;
begin
  select * into target_session from public.cash_register_sessions where id = p_session_id and status = 'open' for update;
  if target_session.id is null then raise exception 'register is closed'; end if;
  if target_session.opened_by <> auth.uid() and not public.has_organization_role(target_session.organization_id, array['owner','admin','manager']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if p_amount <= 0 or length(trim(p_reason)) < 3 then raise exception 'invalid movement'; end if;
  insert into public.cash_register_movements (organization_id, session_id, type, amount, reason, created_by)
  values (target_session.organization_id, p_session_id, p_type, p_amount, trim(p_reason), auth.uid()) returning id into movement_id;
  return movement_id;
end;
$$;

create or replace function public.close_cash_register(p_session_id uuid, p_closing_amount numeric, p_notes text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare target_session public.cash_register_sessions%rowtype; cash_sales numeric(14,2); adjustments numeric(14,2); calculated_expected numeric(14,2);
begin
  select * into target_session from public.cash_register_sessions where id = p_session_id and status = 'open' for update;
  if target_session.id is null then raise exception 'register is closed'; end if;
  if target_session.opened_by <> auth.uid() and not public.has_organization_role(target_session.organization_id, array['owner','admin','manager']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if p_closing_amount < 0 then raise exception 'invalid closing amount'; end if;

  select coalesce(sum(payment.amount), 0) into cash_sales from public.payments payment
  join public.sales sale on sale.id = payment.sale_id
  where sale.organization_id = target_session.organization_id and sale.location_id = target_session.location_id
    and sale.cashier_id = target_session.opened_by and sale.status = 'completed'
    and sale.completed_at >= target_session.opened_at and sale.completed_at <= now() and payment.method = 'cash';
  select coalesce(sum(case when movement.type = 'deposit' then movement.amount else -movement.amount end), 0)
  into adjustments from public.cash_register_movements movement where movement.session_id = p_session_id;
  calculated_expected := target_session.opening_amount + cash_sales + adjustments;

  update public.cash_register_sessions set status = 'closed', expected_amount = calculated_expected,
    closing_amount = p_closing_amount, difference = p_closing_amount - calculated_expected,
    closing_notes = nullif(trim(p_notes), ''), closed_by = auth.uid(), closed_at = now()
  where id = p_session_id;
  return p_closing_amount - calculated_expected;
end;
$$;

revoke all on function public.open_cash_register(uuid, uuid, numeric, text) from public;
revoke all on function public.add_cash_register_movement(uuid, public.cash_movement_type, numeric, text) from public;
revoke all on function public.close_cash_register(uuid, numeric, text) from public;
grant execute on function public.open_cash_register(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.add_cash_register_movement(uuid, public.cash_movement_type, numeric, text) to authenticated;
grant execute on function public.close_cash_register(uuid, numeric, text) to authenticated;
