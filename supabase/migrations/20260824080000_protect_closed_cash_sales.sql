create or replace function public.protect_closed_cash_sale_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'completed' and new.status = 'voided'
    and exists (
      select 1 from public.payments
      where sale_id = old.id and method = 'cash'
    )
    and not exists (
      select 1
      from public.cash_register_sessions
      where organization_id = old.organization_id
        and location_id = old.location_id
        and opened_by = old.cashier_id
        and status = 'open'
        and opened_at <= old.completed_at
    ) then
    raise exception 'closed cash sale requires return';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_closed_cash_sale_void on public.sales;
create trigger protect_closed_cash_sale_void
before update of status on public.sales
for each row execute function public.protect_closed_cash_sale_void();
