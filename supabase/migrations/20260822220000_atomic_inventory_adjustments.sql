create or replace function public.adjust_inventory_stock(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_reorder_point numeric,
  p_reason text default 'Ajuste manual'
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare previous_quantity numeric(14,3); quantity_delta numeric(14,3);
begin
  if not public.has_organization_role(p_organization_id,array['owner','admin','manager','inventory']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if p_reorder_point<0 or length(trim(p_reason))<3 then raise exception 'invalid adjustment'; end if;
  if not exists(select 1 from public.products where id=p_product_id and organization_id=p_organization_id and active) then raise exception 'product unavailable'; end if;
  if not exists(select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active) then raise exception 'location unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text||p_product_id::text,2));
  select quantity into previous_quantity from public.inventory_levels where location_id=p_location_id and product_id=p_product_id for update;
  previous_quantity:=coalesce(previous_quantity,0); quantity_delta:=p_quantity-previous_quantity;
  insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)
    values(p_organization_id,p_location_id,p_product_id,p_quantity,p_reorder_point)
    on conflict(location_id,product_id) do update set quantity=excluded.quantity,reorder_point=excluded.reorder_point,updated_at=now();
  if quantity_delta<>0 then
    insert into public.inventory_movements(organization_id,location_id,product_id,quantity_delta,reason,performed_by)
      values(p_organization_id,p_location_id,p_product_id,quantity_delta,trim(p_reason),auth.uid());
  end if;
  return quantity_delta;
end;
$$;
revoke all on function public.adjust_inventory_stock(uuid,uuid,uuid,numeric,numeric,text) from public;
grant execute on function public.adjust_inventory_stock(uuid,uuid,uuid,numeric,numeric,text) to authenticated;
