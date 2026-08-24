create or replace function public.require_open_register_for_cash()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_location_id uuid; v_user_id uuid; v_is_cash boolean := false;
begin
  if tg_table_name = 'payments' then
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

drop trigger if exists payments_require_open_register on public.payments;
create trigger payments_require_open_register before insert on public.payments for each row execute function public.require_open_register_for_cash();
drop trigger if exists customer_payments_require_open_register on public.customer_account_movements;
create trigger customer_payments_require_open_register before insert on public.customer_account_movements for each row execute function public.require_open_register_for_cash();
drop trigger if exists supplier_payments_require_open_register on public.supplier_account_movements;
create trigger supplier_payments_require_open_register before insert on public.supplier_account_movements for each row execute function public.require_open_register_for_cash();
drop trigger if exists expenses_require_open_register on public.expenses;
create trigger expenses_require_open_register before insert on public.expenses for each row execute function public.require_open_register_for_cash();
drop trigger if exists purchases_require_open_register on public.purchases;
create trigger purchases_require_open_register before insert on public.purchases for each row execute function public.require_open_register_for_cash();
drop trigger if exists sale_returns_require_open_register on public.sale_returns;
create trigger sale_returns_require_open_register before insert on public.sale_returns for each row execute function public.require_open_register_for_cash();
drop trigger if exists purchase_returns_require_open_register on public.purchase_returns;
create trigger purchase_returns_require_open_register before insert on public.purchase_returns for each row execute function public.require_open_register_for_cash();
