create or replace function public.complete_sale(
  p_organization_id uuid,
  p_location_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_amount_received numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sale_id uuid := gen_random_uuid();
  v_receipt_number text;
  v_subtotal numeric(14,2) := 0;
  v_tax_total numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_item record;
  v_product record;
  v_quantity numeric(14,3);
  v_available numeric(14,3);
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = v_user_id and active
      and role in ('owner', 'admin', 'manager', 'cashier')
  ) then raise exception 'sale permission denied'; end if;
  if not exists (
    select 1 from public.locations where id = p_location_id and organization_id = p_organization_id and active
  ) then raise exception 'invalid location'; end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and organization_id = p_organization_id and active
  ) then raise exception 'invalid customer'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'sale requires items'; end if;
  if p_payment_method not in ('cash', 'card', 'transfer', 'store_credit', 'other') then raise exception 'invalid payment method'; end if;

  create temporary table sale_lines (
    product_id uuid primary key,
    quantity numeric(14,3) not null
  ) on commit drop;

  insert into sale_lines (product_id, quantity)
  select item.product_id, sum(item.quantity)
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
  group by item.product_id;

  if exists (select 1 from sale_lines where quantity <= 0) then raise exception 'invalid quantity'; end if;

  for v_item in select * from sale_lines loop
    select id, name, sku, price, cost, tax_rate, track_inventory
      into v_product
    from public.products
    where id = v_item.product_id and organization_id = p_organization_id and active;
    if not found then raise exception 'invalid product'; end if;

    if v_product.track_inventory then
      select quantity into v_available
      from public.inventory_levels
      where location_id = p_location_id and product_id = v_item.product_id
      for update;
      if coalesce(v_available, 0) < v_item.quantity then
        raise exception 'insufficient stock for %', v_product.name;
      end if;
    end if;

    v_subtotal := v_subtotal + round(v_product.price * v_item.quantity, 2);
    v_tax_total := v_tax_total + round(v_product.price * v_item.quantity * v_product.tax_rate, 2);
  end loop;
  v_total := v_subtotal + v_tax_total;
  if v_total <= 0 then raise exception 'sale total must be positive'; end if;
  if p_amount_received is not null and p_payment_method = 'cash' and p_amount_received < v_total then
    raise exception 'insufficient payment';
  end if;

  v_receipt_number := 'V-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(v_sale_id::text, '-', ''), 1, 6));
  insert into public.sales (
    id, organization_id, location_id, customer_id, cashier_id, status, receipt_number,
    subtotal, tax_total, total, completed_at
  ) values (
    v_sale_id, p_organization_id, p_location_id, p_customer_id, v_user_id, 'completed', v_receipt_number,
    v_subtotal, v_tax_total, v_total, now()
  );

  for v_item in select * from sale_lines loop
    select id, name, sku, price, cost, tax_rate, track_inventory into v_product
    from public.products where id = v_item.product_id;
    insert into public.sale_items (
      organization_id, sale_id, product_id, product_name, sku, quantity,
      unit_price, unit_cost, tax_total, line_total
    ) values (
      p_organization_id, v_sale_id, v_product.id, v_product.name, v_product.sku, v_item.quantity,
      v_product.price, v_product.cost,
      round(v_product.price * v_item.quantity * v_product.tax_rate, 2),
      round(v_product.price * v_item.quantity * (1 + v_product.tax_rate), 2)
    );

    if v_product.track_inventory then
      update public.inventory_levels
      set quantity = quantity - v_item.quantity
      where location_id = p_location_id and product_id = v_product.id;
      insert into public.inventory_movements (
        organization_id, location_id, product_id, sale_id, quantity_delta, reason, performed_by
      ) values (p_organization_id, p_location_id, v_product.id, v_sale_id, -v_item.quantity, 'Venta ' || v_receipt_number, v_user_id);
    end if;
  end loop;

  insert into public.payments (organization_id, sale_id, method, amount, reference)
  values (
    p_organization_id, v_sale_id, p_payment_method::public.payment_method, v_total,
    case when p_payment_method = 'cash' and p_amount_received is not null
      then 'Recibido: ' || p_amount_received::text || '; Cambio: ' || (p_amount_received - v_total)::text
      else null end
  );
  return v_sale_id;
end;
$$;

revoke all on function public.complete_sale(uuid, uuid, uuid, jsonb, text, numeric) from public;
grant execute on function public.complete_sale(uuid, uuid, uuid, jsonb, text, numeric) to authenticated;
