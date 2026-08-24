create or replace function public.receive_purchase(p_organization_id uuid,p_location_id uuid,p_supplier_id uuid,p_reference text,p_payment_terms text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();purchase_id uuid:=gen_random_uuid();subtotal numeric(14,2):=0;taxes numeric(14,2):=0;item record;
begin
  if uid is null or not public.has_organization_role(p_organization_id,array['owner','admin','manager','inventory']::public.membership_role[])then raise exception 'purchase permission denied';end if;
  if not exists(select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active)then raise exception 'invalid location';end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and organization_id=p_organization_id and active)then raise exception 'invalid supplier';end if;
  if p_payment_terms not in('cash','credit')or(p_payment_terms='credit'and p_supplier_id is null)then raise exception 'supplier required for credit';end if;
  if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)=0 then raise exception 'items required';end if;
  create temporary table purchase_lines(line_key text primary key,product_id uuid not null,variant_id uuid,quantity numeric(14,3),unit_cost numeric(14,2),product_name text,sku text,tax_rate numeric(8,6))on commit drop;
  insert into purchase_lines(line_key,product_id,variant_id,quantity,unit_cost)select value.product_id::text||':'||coalesce(value.variant_id::text,'base'),value.product_id,value.variant_id,sum(value.quantity),max(value.unit_cost)from jsonb_to_recordset(p_items)value(product_id uuid,variant_id uuid,quantity numeric,unit_cost numeric)group by value.product_id,value.variant_id;
  if exists(select 1 from purchase_lines where quantity<=0 or unit_cost<0)then raise exception 'invalid line';end if;
  update purchase_lines target set product_name=case when variant.id is null then product.name else product.name||' · '||variant.name end,sku=coalesce(variant.sku,product.sku),tax_rate=product.tax_rate from public.products product left join public.product_variants variant on variant.id=target.variant_id and variant.product_id=product.id and variant.organization_id=p_organization_id and variant.active where product.id=target.product_id and product.organization_id=p_organization_id and product.active and(target.variant_id is null or variant.id is not null);
  if exists(select 1 from purchase_lines where product_name is null)then raise exception 'invalid product or variant';end if;
  select sum(round(quantity*unit_cost,2)),sum(round(quantity*unit_cost*tax_rate,2))into subtotal,taxes from purchase_lines;
  insert into public.purchases(id,organization_id,location_id,supplier_id,received_by,reference,payment_terms,subtotal,tax_total,total)values(purchase_id,p_organization_id,p_location_id,p_supplier_id,uid,nullif(trim(p_reference),''),p_payment_terms,subtotal,taxes,subtotal+taxes);
  for item in select*from purchase_lines order by line_key loop
    insert into public.purchase_items(organization_id,purchase_id,product_id,variant_id,product_name,sku,quantity,unit_cost,tax_total,line_total)values(p_organization_id,purchase_id,item.product_id,item.variant_id,item.product_name,item.sku,item.quantity,item.unit_cost,round(item.quantity*item.unit_cost*item.tax_rate,2),round(item.quantity*item.unit_cost*(1+item.tax_rate),2));
    if item.variant_id is null then insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)values(p_organization_id,p_location_id,item.product_id,item.quantity,0)on conflict(location_id,product_id)do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();update public.products set cost=item.unit_cost where id=item.product_id;
    else insert into public.variant_inventory_levels(organization_id,location_id,variant_id,quantity,reorder_point)values(p_organization_id,p_location_id,item.variant_id,item.quantity,0)on conflict(location_id,variant_id)do update set quantity=public.variant_inventory_levels.quantity+excluded.quantity,updated_at=now();update public.product_variants set cost=item.unit_cost,updated_at=now()where id=item.variant_id;end if;
    insert into public.inventory_movements(organization_id,location_id,product_id,variant_id,quantity_delta,reason,performed_by)values(p_organization_id,p_location_id,item.product_id,item.variant_id,item.quantity,'Recepción '||coalesce(nullif(trim(p_reference),''),purchase_id::text),uid);
  end loop;
  if p_payment_terms='credit'then insert into public.supplier_account_movements(organization_id,location_id,supplier_id,purchase_id,type,amount,created_by)values(p_organization_id,p_location_id,p_supplier_id,purchase_id,'charge',subtotal+taxes,uid);end if;return purchase_id;
end;$$;

create or replace function public.void_purchase(p_purchase_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.purchases%rowtype;item record;available numeric(14,3);supplier_balance numeric(14,2);
begin
  if length(trim(p_reason))<3 then raise exception 'reason required';end if;select*into target from public.purchases where id=p_purchase_id for update;
  if target.id is null or target.status<>'received'then raise exception 'purchase unavailable';end if;if not public.has_organization_role(target.organization_id,array['owner','admin','manager']::public.membership_role[])then raise exception 'insufficient permissions';end if;
  for item in select product_id,variant_id,quantity,product_name from public.purchase_items where purchase_id=p_purchase_id order by product_id,variant_id loop
    if item.variant_id is null then select quantity into available from public.inventory_levels where location_id=target.location_id and product_id=item.product_id for update;else select quantity into available from public.variant_inventory_levels where location_id=target.location_id and variant_id=item.variant_id for update;end if;
    if coalesce(available,0)<item.quantity then raise exception 'insufficient stock to reverse %',item.product_name;end if;
  end loop;
  if target.payment_terms='credit'then select coalesce(sum(case type when'charge'then amount else-amount end),0)into supplier_balance from public.supplier_account_movements where supplier_id=target.supplier_id;if supplier_balance<target.total then raise exception 'supplier balance already paid';end if;end if;
  for item in select product_id,variant_id,quantity from public.purchase_items where purchase_id=p_purchase_id order by product_id,variant_id loop
    if item.variant_id is null then update public.inventory_levels set quantity=quantity-item.quantity,updated_at=now()where location_id=target.location_id and product_id=item.product_id;else update public.variant_inventory_levels set quantity=quantity-item.quantity,updated_at=now()where location_id=target.location_id and variant_id=item.variant_id;end if;
    insert into public.inventory_movements(organization_id,location_id,product_id,variant_id,quantity_delta,reason,performed_by)values(target.organization_id,target.location_id,item.product_id,item.variant_id,-item.quantity,'Anulación de recepción '||coalesce(target.reference,target.id::text),auth.uid());
  end loop;
  if target.payment_terms='credit'then insert into public.supplier_account_movements(organization_id,location_id,supplier_id,purchase_id,type,amount,notes,created_by)values(target.organization_id,target.location_id,target.supplier_id,target.id,'void',target.total,'Reversión por anulación de compra',auth.uid());end if;
  insert into public.purchase_voids(organization_id,purchase_id,reason,voided_by)values(target.organization_id,target.id,trim(p_reason),auth.uid());update public.purchases set status='voided'where id=target.id;
end;$$;
revoke all on function public.receive_purchase(uuid,uuid,uuid,text,text,jsonb)from public;
revoke all on function public.void_purchase(uuid,text)from public;
grant execute on function public.receive_purchase(uuid,uuid,uuid,text,text,jsonb)to authenticated;
grant execute on function public.void_purchase(uuid,text)to authenticated;
