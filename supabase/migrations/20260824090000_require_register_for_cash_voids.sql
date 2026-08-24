create or replace function public.require_open_register_for_cash()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_location_id uuid; v_user_id uuid; v_is_cash boolean := false;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'expenses' then
    v_is_cash := old.status::text = 'posted' and new.status::text = 'voided' and old.payment_method::text = 'cash';
    v_organization_id := old.organization_id; v_location_id := old.location_id; v_user_id := new.voided_by;
  elsif tg_op = 'UPDATE' and tg_table_name = 'purchases' then
    v_is_cash := old.status::text = 'received' and new.status::text = 'voided' and old.payment_terms = 'cash';
    v_organization_id := old.organization_id; v_location_id := old.location_id; v_user_id := auth.uid();
  elsif tg_table_name = 'payments' then
    v_is_cash := new.method::text = 'cash';
    if v_is_cash then select organization_id, location_id, cashier_id into v_organization_id, v_location_id, v_user_id from public.sales where id = new.sale_id; end if;
  elsif tg_table_name = 'customer_account_movements' then
    v_is_cash := new.type::text = 'payment' and new.payment_method::text = 'cash'; v_organization_id := new.organization_id; v_location_id := new.location_id; v_user_id := new.created_by;
  elsif tg_table_name = 'supplier_account_movements' then
    v_is_cash := new.type::text = 'payment' and new.payment_method::text = 'cash'; v_organization_id := new.organization_id; v_location_id := new.location_id; v_user_id := new.created_by;
  elsif tg_table_name = 'expenses' then
    v_is_cash := new.status::text = 'posted' and new.payment_method::text = 'cash'; v_organization_id := new.organization_id; v_location_id := new.location_id; v_user_id := new.created_by;
  elsif tg_table_name = 'purchases' then
    v_is_cash := new.status::text = 'received' and new.payment_terms = 'cash'; v_organization_id := new.organization_id; v_location_id := new.location_id; v_user_id := new.received_by;
  elsif tg_table_name = 'sale_returns' then
    v_is_cash := new.refund_method::text = 'cash'; v_organization_id := new.organization_id; v_location_id := new.location_id; v_user_id := new.created_by;
  elsif tg_table_name = 'purchase_returns' then
    v_is_cash := new.resolution = 'cash'; v_organization_id := new.organization_id; v_location_id := new.location_id; v_user_id := new.created_by;
  end if;
  if v_is_cash and not exists (select 1 from public.cash_register_sessions where organization_id=v_organization_id and location_id=v_location_id and opened_by=v_user_id and status='open') then
    raise exception 'open cash register required';
  end if;
  return new;
end;$$;

drop trigger if exists expense_voids_require_open_register on public.expenses;
create trigger expense_voids_require_open_register before update of status on public.expenses for each row execute function public.require_open_register_for_cash();
drop trigger if exists purchase_voids_require_open_register on public.purchases;
create trigger purchase_voids_require_open_register before update of status on public.purchases for each row execute function public.require_open_register_for_cash();
