alter table public.customer_account_movements
  add column due_date date;

alter table public.supplier_account_movements
  add column due_date date;

update public.customer_account_movements
set due_date = (created_at at time zone 'UTC')::date + 30
where type = 'charge' and due_date is null;

update public.supplier_account_movements
set due_date = (created_at at time zone 'UTC')::date + 30
where type = 'charge' and due_date is null;

create or replace function public.set_account_movement_due_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type::text = 'charge' and new.due_date is null then
    new.due_date := coalesce((new.created_at at time zone 'UTC')::date, current_date) + 30;
  end if;
  return new;
end;
$$;

create trigger customer_account_default_due_date
before insert on public.customer_account_movements
for each row execute function public.set_account_movement_due_date();

create trigger supplier_account_default_due_date
before insert on public.supplier_account_movements
for each row execute function public.set_account_movement_due_date();

create index customer_account_due_date_idx
  on public.customer_account_movements (organization_id, due_date)
  where type = 'charge';

create index supplier_account_due_date_idx
  on public.supplier_account_movements (organization_id, due_date)
  where type = 'charge';
