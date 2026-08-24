create or replace function public.create_catalog_product(
  p_organization_id uuid,p_location_id uuid,p_name text,p_category_name text,p_sku text,p_barcode text,
  p_cost numeric,p_price numeric,p_tax_rate numeric,p_quantity numeric,p_reorder_point numeric,
  p_manufacturer_id uuid,p_tag_ids uuid[]
)
returns uuid language plpgsql security definer set search_path='' as $$
declare product_id uuid; requested_tags integer; valid_tags integer;
begin
  if p_manufacturer_id is not null and not exists(select 1 from public.manufacturers where id=p_manufacturer_id and organization_id=p_organization_id and active) then raise exception 'invalid manufacturer';end if;
  select count(*) into requested_tags from (select distinct unnest(coalesce(p_tag_ids,array[]::uuid[])) id) tags;
  select count(*) into valid_tags from public.tags where organization_id=p_organization_id and active and id in(select distinct unnest(coalesce(p_tag_ids,array[]::uuid[])));
  if requested_tags<>valid_tags then raise exception 'invalid tags';end if;
  product_id:=public.create_inventory_product(p_organization_id,p_location_id,p_name,p_category_name,p_sku,p_barcode,p_cost,p_price,p_tax_rate,p_quantity,p_reorder_point);
  update public.products set manufacturer_id=p_manufacturer_id where id=product_id;
  insert into public.product_tags(organization_id,product_id,tag_id)
  select p_organization_id,product_id,id from (select distinct unnest(coalesce(p_tag_ids,array[]::uuid[])) id) selected;
  return product_id;
end;$$;

create or replace function public.update_catalog_product(
  p_product_id uuid,p_organization_id uuid,p_name text,p_category_name text,p_sku text,p_barcode text,
  p_cost numeric,p_price numeric,p_tax_rate numeric,p_manufacturer_id uuid,p_tag_ids uuid[]
)
returns void language plpgsql security definer set search_path='' as $$
declare requested_tags integer;valid_tags integer;
begin
  if p_manufacturer_id is not null and not exists(select 1 from public.manufacturers where id=p_manufacturer_id and organization_id=p_organization_id and active) then raise exception 'invalid manufacturer';end if;
  select count(*) into requested_tags from (select distinct unnest(coalesce(p_tag_ids,array[]::uuid[])) id) tags;
  select count(*) into valid_tags from public.tags where organization_id=p_organization_id and active and id in(select distinct unnest(coalesce(p_tag_ids,array[]::uuid[])));
  if requested_tags<>valid_tags then raise exception 'invalid tags';end if;
  perform public.update_inventory_product(p_product_id,p_organization_id,p_name,p_category_name,p_sku,p_barcode,p_cost,p_price,p_tax_rate);
  update public.products set manufacturer_id=p_manufacturer_id where id=p_product_id and organization_id=p_organization_id;
  delete from public.product_tags where product_id=p_product_id and organization_id=p_organization_id;
  insert into public.product_tags(organization_id,product_id,tag_id)
  select p_organization_id,p_product_id,id from (select distinct unnest(coalesce(p_tag_ids,array[]::uuid[])) id) selected;
end;$$;

revoke all on function public.create_catalog_product(uuid,uuid,text,text,text,text,numeric,numeric,numeric,numeric,numeric,uuid,uuid[]) from public;
revoke all on function public.update_catalog_product(uuid,uuid,text,text,text,text,numeric,numeric,numeric,uuid,uuid[]) from public;
grant execute on function public.create_catalog_product(uuid,uuid,text,text,text,text,numeric,numeric,numeric,numeric,numeric,uuid,uuid[]) to authenticated;
grant execute on function public.update_catalog_product(uuid,uuid,text,text,text,text,numeric,numeric,numeric,uuid,uuid[]) to authenticated;
