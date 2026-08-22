alter table public.organizations
  add column customer_credit_days integer not null default 30
    check (customer_credit_days between 1 and 365),
  add column supplier_credit_days integer not null default 30
    check (supplier_credit_days between 1 and 365);

create or replace function public.set_account_movement_due_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  credit_days integer;
begin
  if new.type::text = 'charge' and new.due_date is null then
    if tg_table_name = 'customer_account_movements' then
      select customer_credit_days into credit_days
      from public.organizations where id = new.organization_id;
    else
      select supplier_credit_days into credit_days
      from public.organizations where id = new.organization_id;
    end if;

    new.due_date := coalesce((new.created_at at time zone 'UTC')::date, current_date)
      + coalesce(credit_days, 30);
  end if;
  return new;
end;
$$;
