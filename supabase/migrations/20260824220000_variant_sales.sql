create or replace function public.complete_variant_sale(
  p_organization_id uuid,p_location_id uuid,p_customer_id uuid,p_items jsonb,
  p_payment_method text,p_amount_received numeric,p_discount_type text,p_discount_value numeric
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid();v_sale_id uuid:=gen_random_uuid();v_receipt text;v_subtotal numeric(14,2):=0;v_discount_requested numeric(14,2):=0;v_discount_total numeric(14,2):=0;v_tax_total numeric(14,2):=0;v_total numeric(14,2):=0;line record;available numeric(14,3);line_discount numeric(14,2);line_tax numeric(14,2);line_total numeric(14,2);
begin
  if v_user_id is null then raise exception 'authentication required';end if;
  if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=v_user_id and active and role in('owner','admin','manager','cashier'))then raise exception 'sale permission denied';end if;
  if not exists(select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active)then raise exception 'invalid location';end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id and active)then raise exception 'invalid customer';end if;
  if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)=0 then raise exception 'sale requires items';end if;
  if p_payment_method not in('cash','card','transfer','store_credit','other')then raise exception 'invalid payment method';end if;
  if p_discount_type not in('none','percent','fixed')or coalesce(p_discount_value,0)<0 or(p_discount_type='percent'and p_discount_value>100)then raise exception 'invalid discount';end if;
  create temporary table sale_lines(line_key text primary key,product_id uuid not null,variant_id uuid,quantity numeric(14,3)not null,unit_price numeric(14,2),tax_rate numeric(8,6),product_name text,sku text,unit_cost numeric(14,2))on commit drop;
  insert into sale_lines(line_key,product_id,variant_id,quantity)
  select item.product_id::text||':'||coalesce(item.variant_id::text,'base'),item.product_id,item.variant_id,sum(item.quantity)
  from jsonb_to_recordset(p_items)item(product_id uuid,variant_id uuid,quantity numeric)group by item.product_id,item.variant_id;
  if exists(select 1 from sale_lines where quantity<=0)then raise exception 'invalid quantity';end if;
  update sale_lines target set unit_price=coalesce(variant.price,public.product_rule_price(p_organization_id,product.id,target.quantity,now())),tax_rate=product.tax_rate,product_name=case when variant.id is null then product.name else product.name||' · '||variant.name end,sku=coalesce(variant.sku,product.sku),unit_cost=coalesce(variant.cost,product.cost)
  from public.products product left join public.product_variants variant on variant.product_id=product.id and variant.id=target.variant_id and variant.organization_id=p_organization_id and variant.active
  where product.id=target.product_id and product.organization_id=p_organization_id and product.active and(target.variant_id is null or variant.id is not null);
  if exists(select 1 from sale_lines where unit_price is null)then raise exception 'invalid product or variant';end if;
  if exists(select 1 from sale_lines line join public.product_kits kit on kit.product_id=line.product_id and kit.active where line.variant_id is not null)then raise exception 'kit variants are not supported';end if;
  create temporary table stock_requirements(product_id uuid primary key,quantity numeric(14,3)not null)on commit drop;
  insert into stock_requirements select required.product_id,sum(required.quantity)from(
    select line.product_id,line.quantity from sale_lines line join public.products product on product.id=line.product_id where line.variant_id is null and product.track_inventory and not exists(select 1 from public.product_kits kit where kit.product_id=line.product_id and kit.active)
    union all select item.component_product_id,line.quantity*item.quantity from sale_lines line join public.product_kits kit on kit.product_id=line.product_id and kit.organization_id=p_organization_id and kit.active join public.product_kit_items item on item.kit_id=kit.id
  )required group by required.product_id;
  for line in select*from stock_requirements order by product_id loop select quantity into available from public.inventory_levels where location_id=p_location_id and product_id=line.product_id for update;if coalesce(available,0)<line.quantity then raise exception 'insufficient stock';end if;end loop;
  for line in select variant_id,quantity from sale_lines where variant_id is not null order by variant_id loop select quantity into available from public.variant_inventory_levels where location_id=p_location_id and variant_id=line.variant_id for update;if coalesce(available,0)<line.quantity then raise exception 'insufficient variant stock';end if;end loop;
  select sum(round(unit_price*quantity,2))into v_subtotal from sale_lines;v_discount_requested:=case p_discount_type when'percent'then round(v_subtotal*p_discount_value/100,2)when'fixed'then round(p_discount_value,2)else 0 end;if v_discount_requested>=v_subtotal then raise exception 'discount exceeds subtotal';end if;
  v_receipt:='V-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_sale_id::text,'-',''),1,6));
  insert into public.sales(id,organization_id,location_id,customer_id,cashier_id,status,receipt_number,subtotal,discount_total,tax_total,total,completed_at)values(v_sale_id,p_organization_id,p_location_id,p_customer_id,v_user_id,'completed',v_receipt,v_subtotal,0,0,0,now());
  for line in select*from sale_lines order by line_key loop line_discount:=case when v_subtotal=0 then 0 else round(round(line.unit_price*line.quantity,2)*v_discount_requested/v_subtotal,2)end;line_tax:=round((round(line.unit_price*line.quantity,2)-line_discount)*line.tax_rate,2);line_total:=round(line.unit_price*line.quantity,2)-line_discount+line_tax;v_discount_total:=v_discount_total+line_discount;v_tax_total:=v_tax_total+line_tax;v_total:=v_total+line_total;
    insert into public.sale_items(organization_id,sale_id,product_id,variant_id,product_name,sku,quantity,unit_price,unit_cost,discount_total,tax_total,line_total)values(p_organization_id,v_sale_id,line.product_id,line.variant_id,line.product_name,line.sku,line.quantity,line.unit_price,line.unit_cost,line_discount,line_tax,line_total);
  end loop;
  if v_total<=0 then raise exception 'sale total must be positive';end if;if p_payment_method='cash'and p_amount_received is not null and p_amount_received<v_total then raise exception 'insufficient payment';end if;
  update public.sales set discount_total=v_discount_total,tax_total=v_tax_total,total=v_total where id=v_sale_id;
  for line in select*from stock_requirements order by product_id loop update public.inventory_levels set quantity=quantity-line.quantity,updated_at=now()where location_id=p_location_id and product_id=line.product_id;insert into public.inventory_movements(organization_id,location_id,product_id,sale_id,quantity_delta,reason,performed_by)values(p_organization_id,p_location_id,line.product_id,v_sale_id,-line.quantity,'Venta '||v_receipt,v_user_id);end loop;
  for line in select product_id,variant_id,quantity from sale_lines where variant_id is not null order by variant_id loop update public.variant_inventory_levels set quantity=quantity-line.quantity,updated_at=now()where location_id=p_location_id and variant_id=line.variant_id;insert into public.inventory_movements(organization_id,location_id,product_id,variant_id,sale_id,quantity_delta,reason,performed_by)values(p_organization_id,p_location_id,line.product_id,line.variant_id,v_sale_id,-line.quantity,'Venta de variante '||v_receipt,v_user_id);end loop;
  insert into public.payments(organization_id,sale_id,method,amount,reference)values(p_organization_id,v_sale_id,p_payment_method::public.payment_method,v_total,case when p_payment_method='cash'and p_amount_received is not null then'Recibido: '||p_amount_received::text||'; Cambio: '||(p_amount_received-v_total)::text else null end);return v_sale_id;
end;$$;
create or replace function public.void_sale(p_sale_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.sales%rowtype;movement record;
begin
  if auth.uid()is null or length(trim(p_reason))<3 then raise exception 'invalid void';end if;select*into target from public.sales where id=p_sale_id for update;
  if target.id is null or target.status<>'completed'then raise exception 'sale cannot be voided';end if;
  if not(public.has_organization_role(target.organization_id,array['owner','admin','manager']::public.membership_role[])or(public.has_organization_role(target.organization_id,array['cashier']::public.membership_role[])and target.cashier_id=auth.uid()))then raise exception 'insufficient permissions';end if;
  for movement in select product_id,variant_id,-sum(quantity_delta)quantity from public.inventory_movements where sale_id=p_sale_id and quantity_delta<0 group by product_id,variant_id order by product_id,variant_id loop
    if movement.variant_id is null then insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)values(target.organization_id,target.location_id,movement.product_id,movement.quantity,0)on conflict(location_id,product_id)do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
    else insert into public.variant_inventory_levels(organization_id,location_id,variant_id,quantity,reorder_point)values(target.organization_id,target.location_id,movement.variant_id,movement.quantity,0)on conflict(location_id,variant_id)do update set quantity=public.variant_inventory_levels.quantity+excluded.quantity,updated_at=now();end if;
    insert into public.inventory_movements(organization_id,location_id,product_id,variant_id,sale_id,quantity_delta,reason,performed_by)values(target.organization_id,target.location_id,movement.product_id,movement.variant_id,p_sale_id,movement.quantity,'Anulación de venta',auth.uid());
  end loop;
  insert into public.sale_voids(organization_id,sale_id,reason,voided_by)values(target.organization_id,p_sale_id,trim(p_reason),auth.uid());update public.sales set status='voided',updated_at=now()where id=p_sale_id;
end;$$;
revoke all on function public.complete_variant_sale(uuid,uuid,uuid,jsonb,text,numeric,text,numeric)from public;
revoke all on function public.void_sale(uuid,text)from public;
grant execute on function public.complete_variant_sale(uuid,uuid,uuid,jsonb,text,numeric,text,numeric)to authenticated;
grant execute on function public.void_sale(uuid,text)to authenticated;
