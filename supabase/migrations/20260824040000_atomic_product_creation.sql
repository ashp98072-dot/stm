create or replace function public.create_inventory_product(
  p_organization_id uuid,
  p_location_id uuid,
  p_name text,
  p_category_name text,
  p_sku text,
  p_barcode text,
  p_cost numeric,
  p_price numeric,
  p_tax_rate numeric,
  p_quantity numeric,
  p_reorder_point numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_id uuid;
  product_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner','admin','manager','inventory']::public.membership_role[]
  ) then
    raise exception 'inventory permission denied';
  end if;
  if not exists (
    select 1 from public.locations
    where id = p_location_id and organization_id = p_organization_id and active
  ) then
    raise exception 'invalid location';
  end if;
  if length(trim(p_name)) < 2 or p_cost < 0 or p_price < 0
    or p_tax_rate < 0 or p_tax_rate > 1 or p_quantity < 0 or p_reorder_point < 0 then
    raise exception 'invalid product data';
  end if;

  if nullif(trim(p_category_name), '') is not null then
    select id into category_id
    from public.categories
    where organization_id = p_organization_id and name ilike trim(p_category_name)
    order by created_at
    limit 1;

    if category_id is null then
      insert into public.categories (organization_id, name)
      values (p_organization_id, trim(p_category_name))
      returning id into category_id;
    end if;
  end if;

  insert into public.products (
    id, organization_id, category_id, name, sku, barcode, cost, price, tax_rate, track_inventory
  ) values (
    product_id, p_organization_id, category_id, trim(p_name), nullif(trim(p_sku), ''),
    nullif(trim(p_barcode), ''), p_cost, p_price, p_tax_rate, true
  );

  insert into public.inventory_levels (
    organization_id, location_id, product_id, quantity, reorder_point
  ) values (
    p_organization_id, p_location_id, product_id, p_quantity, p_reorder_point
  );

  if p_quantity <> 0 then
    insert into public.inventory_movements (
      organization_id, location_id, product_id, quantity_delta, reason, performed_by
    ) values (
      p_organization_id, p_location_id, product_id, p_quantity, 'Inventario inicial', auth.uid()
    );
  end if;

  return product_id;
end;
$$;

revoke all on function public.create_inventory_product(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.create_inventory_product(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric) to authenticated;
