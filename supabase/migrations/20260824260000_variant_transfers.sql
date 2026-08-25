alter table public.inventory_transfer_items add column variant_id uuid;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_variant_same_org foreign key(organization_id,variant_id)references public.product_variants(organization_id,id)on delete set null;
create index inventory_transfer_items_variant_idx on public.inventory_transfer_items(variant_id)where variant_id is not null;

create or replace function public.transfer_inventory(p_organization_id uuid,p_source_location_id uuid,p_destination_location_id uuid,p_reference text,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_transfer_id uuid:=gen_random_uuid();item record;available_quantity numeric(14,3);
begin
  if not public.has_organization_role(p_organization_id,array['owner','admin','manager','inventory']::public.membership_role[])then raise exception 'insufficient permissions';end if;
  if p_source_location_id=p_destination_location_id then raise exception 'locations must differ';end if;
  if not exists(select 1 from public.locations where id=p_source_location_id and organization_id=p_organization_id and active)or not exists(select 1 from public.locations where id=p_destination_location_id and organization_id=p_organization_id and active)then raise exception 'location unavailable';end if;
  if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)=0 then raise exception 'items required';end if;
  create temporary table transfer_lines(line_key text primary key,product_id uuid not null,variant_id uuid,quantity numeric(14,3)not null,item_name text)on commit drop;
  insert into transfer_lines(line_key,product_id,variant_id,quantity)select value.product_id::text||':'||coalesce(value.variant_id::text,'base'),value.product_id,value.variant_id,sum(value.quantity)from jsonb_to_recordset(p_items)value(product_id uuid,variant_id uuid,quantity numeric)group by value.product_id,value.variant_id;
  if exists(select 1 from transfer_lines where quantity<=0)then raise exception 'invalid quantity';end if;
  update transfer_lines target set item_name=case when variant.id is null then product.name else product.name||' · '||variant.name end from public.products product left join public.product_variants variant on variant.id=target.variant_id and variant.product_id=product.id and variant.organization_id=p_organization_id and variant.active where product.id=target.product_id and product.organization_id=p_organization_id and product.active and(target.variant_id is null or variant.id is not null);
  if exists(select 1 from transfer_lines where item_name is null)then raise exception 'product unavailable';end if;
  for item in select*from transfer_lines order by product_id,variant_id loop
    if item.variant_id is null then select quantity into available_quantity from public.inventory_levels where organization_id=p_organization_id and location_id=p_source_location_id and product_id=item.product_id for update;else select quantity into available_quantity from public.variant_inventory_levels where organization_id=p_organization_id and location_id=p_source_location_id and variant_id=item.variant_id for update;end if;
    if coalesce(available_quantity,0)<item.quantity then raise exception 'insufficient stock for %',item.item_name;end if;
  end loop;
  insert into public.inventory_transfers(id,organization_id,source_location_id,destination_location_id,reference,notes,transferred_by)values(new_transfer_id,p_organization_id,p_source_location_id,p_destination_location_id,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid());
  for item in select*from transfer_lines order by product_id,variant_id loop
    if item.variant_id is null then
      update public.inventory_levels set quantity=quantity-item.quantity,updated_at=now()where location_id=p_source_location_id and product_id=item.product_id;
      insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)values(p_organization_id,p_destination_location_id,item.product_id,item.quantity,0)on conflict(location_id,product_id)do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
    else
      update public.variant_inventory_levels set quantity=quantity-item.quantity,updated_at=now()where location_id=p_source_location_id and variant_id=item.variant_id;
      insert into public.variant_inventory_levels(organization_id,location_id,variant_id,quantity,reorder_point)values(p_organization_id,p_destination_location_id,item.variant_id,item.quantity,0)on conflict(location_id,variant_id)do update set quantity=public.variant_inventory_levels.quantity+excluded.quantity,updated_at=now();
    end if;
    insert into public.inventory_transfer_items(organization_id,transfer_id,product_id,variant_id,product_name,quantity)values(p_organization_id,new_transfer_id,item.product_id,item.variant_id,item.item_name,item.quantity);
    insert into public.inventory_movements(organization_id,location_id,product_id,variant_id,quantity_delta,reason,performed_by)values(p_organization_id,p_source_location_id,item.product_id,item.variant_id,-item.quantity,'Transferencia enviada '||new_transfer_id::text,auth.uid()),(p_organization_id,p_destination_location_id,item.product_id,item.variant_id,item.quantity,'Transferencia recibida '||new_transfer_id::text,auth.uid());
  end loop;return new_transfer_id;
end;$$;
revoke all on function public.transfer_inventory(uuid,uuid,uuid,text,text,jsonb)from public;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,text,text,jsonb)to authenticated;
