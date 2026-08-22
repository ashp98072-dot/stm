create or replace function public.close_cash_register(p_session_id uuid, p_closing_amount numeric, p_notes text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare target_session public.cash_register_sessions%rowtype; cash_sales numeric(14,2); cash_returns numeric(14,2); credit_collections numeric(14,2); adjustments numeric(14,2); calculated_expected numeric(14,2);
begin
  select * into target_session from public.cash_register_sessions where id=p_session_id and status='open' for update;
  if target_session.id is null then raise exception 'register is closed'; end if;
  if target_session.opened_by<>auth.uid() and not public.has_organization_role(target_session.organization_id,array['owner','admin','manager']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if p_closing_amount<0 then raise exception 'invalid closing amount'; end if;
  select coalesce(sum(payment.amount),0) into cash_sales from public.payments payment join public.sales sale on sale.id=payment.sale_id where sale.organization_id=target_session.organization_id and sale.location_id=target_session.location_id and sale.cashier_id=target_session.opened_by and sale.status='completed' and sale.completed_at between target_session.opened_at and now() and payment.method='cash';
  select coalesce(sum(total),0) into cash_returns from public.sale_returns where organization_id=target_session.organization_id and location_id=target_session.location_id and created_by=target_session.opened_by and refund_method='cash' and created_at between target_session.opened_at and now();
  select coalesce(sum(amount),0) into credit_collections from public.customer_account_movements where organization_id=target_session.organization_id and location_id=target_session.location_id and created_by=target_session.opened_by and type='payment' and payment_method='cash' and created_at between target_session.opened_at and now();
  select coalesce(sum(case when type='deposit' then amount else -amount end),0) into adjustments from public.cash_register_movements where session_id=p_session_id;
  calculated_expected:=target_session.opening_amount+cash_sales+credit_collections+adjustments-cash_returns;
  update public.cash_register_sessions set status='closed',expected_amount=calculated_expected,closing_amount=p_closing_amount,difference=p_closing_amount-calculated_expected,closing_notes=nullif(trim(p_notes),''),closed_by=auth.uid(),closed_at=now() where id=p_session_id;
  return p_closing_amount-calculated_expected;
end;
$$;
