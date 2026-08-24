create or replace function public.transfer_inventory(
  p_organization_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_reference text,
  p_notes text,
  p_items jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_transfer_id uuid := gen_random_uuid();
  item record;
  item_name text;
  available_quantity numeric(14,3);
begin
  if not public.has_organization_role(p_organization_id, array['owner','admin','manager','inventory']::public.membership_role[]) then
    raise exception 'insufficient permissions';
  end if;
  if p_source_location_id = p_destination_location_id then raise exception 'locations must differ'; end if;
  if not exists (select 1 from public.locations where id=p_source_location_id and organization_id=p_organization_id and active)
    or not exists (select 1 from public.locations where id=p_destination_location_id and organization_id=p_organization_id and active) then
    raise exception 'location unavailable';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'items required'; end if;

  create temporary table transfer_lines(
    product_id uuid primary key,
    quantity numeric(14,3) not null
  ) on commit drop;
  insert into transfer_lines(product_id,quantity)
  select value.product_id,sum(value.quantity)
  from jsonb_to_recordset(p_items) value(product_id uuid,quantity numeric)
  group by value.product_id;
  if exists(select 1 from transfer_lines where quantity<=0) then raise exception 'invalid quantity'; end if;

  -- The fixed order prevents concurrent transfers from locking products in opposite order.
  for item in select * from transfer_lines order by product_id loop
    select name into item_name from public.products
    where id=item.product_id and organization_id=p_organization_id and active
    for update;
    if item_name is null then raise exception 'product unavailable'; end if;
    select quantity into available_quantity from public.inventory_levels
    where organization_id=p_organization_id and location_id=p_source_location_id and product_id=item.product_id
    for update;
    if coalesce(available_quantity,0)<item.quantity then raise exception 'insufficient stock for %',item_name; end if;
  end loop;

  insert into public.inventory_transfers(id,organization_id,source_location_id,destination_location_id,reference,notes,transferred_by)
  values(new_transfer_id,p_organization_id,p_source_location_id,p_destination_location_id,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid());

  for item in select * from transfer_lines order by product_id loop
    select name into item_name from public.products where id=item.product_id;
    update public.inventory_levels set quantity=quantity-item.quantity,updated_at=now()
    where location_id=p_source_location_id and product_id=item.product_id;
    insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)
    values(p_organization_id,p_destination_location_id,item.product_id,item.quantity,0)
    on conflict(location_id,product_id) do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
    insert into public.inventory_transfer_items(organization_id,transfer_id,product_id,product_name,quantity)
    values(p_organization_id,new_transfer_id,item.product_id,item_name,item.quantity);
    insert into public.inventory_movements(organization_id,location_id,product_id,quantity_delta,reason,performed_by)
    values
      (p_organization_id,p_source_location_id,item.product_id,-item.quantity,'Transferencia enviada '||new_transfer_id::text,auth.uid()),
      (p_organization_id,p_destination_location_id,item.product_id,item.quantity,'Transferencia recibida '||new_transfer_id::text,auth.uid());
  end loop;
  return new_transfer_id;
end;$$;

revoke all on function public.transfer_inventory(uuid,uuid,uuid,text,text,jsonb) from public;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,text,text,jsonb) to authenticated;
