create or replace function public.update_inventory_product(
  p_product_id uuid,
  p_organization_id uuid,
  p_name text,
  p_category_name text,
  p_sku text,
  p_barcode text,
  p_cost numeric,
  p_price numeric,
  p_tax_rate numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner','admin','manager','inventory']::public.membership_role[]
  ) then
    raise exception 'inventory permission denied';
  end if;
  if length(trim(p_name)) < 2 or p_cost < 0 or p_price < 0
    or p_tax_rate < 0 or p_tax_rate > 1 then
    raise exception 'invalid product data';
  end if;

  if nullif(trim(p_category_name), '') is not null then
    select id into v_category_id
    from public.categories
    where organization_id = p_organization_id and name ilike trim(p_category_name)
    order by created_at
    limit 1;

    if v_category_id is null then
      insert into public.categories (organization_id, name)
      values (p_organization_id, trim(p_category_name))
      returning id into v_category_id;
    end if;
  end if;

  update public.products
  set name = trim(p_name),
      category_id = v_category_id,
      sku = nullif(trim(p_sku), ''),
      barcode = nullif(trim(p_barcode), ''),
      cost = p_cost,
      price = p_price,
      tax_rate = p_tax_rate,
      updated_at = now()
  where id = p_product_id and organization_id = p_organization_id and active;

  if not found then
    raise exception 'product unavailable';
  end if;
end;
$$;

create or replace function public.deactivate_inventory_product(
  p_product_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner','admin','manager','inventory']::public.membership_role[]
  ) then
    raise exception 'inventory permission denied';
  end if;

  update public.products
  set active = false, updated_at = now()
  where id = p_product_id and organization_id = p_organization_id and active;

  if not found then
    raise exception 'product unavailable';
  end if;
end;
$$;

revoke all on function public.update_inventory_product(uuid, uuid, text, text, text, text, numeric, numeric, numeric) from public;
revoke all on function public.deactivate_inventory_product(uuid, uuid) from public;
grant execute on function public.update_inventory_product(uuid, uuid, text, text, text, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.deactivate_inventory_product(uuid, uuid) to authenticated;
