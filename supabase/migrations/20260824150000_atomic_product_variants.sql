create or replace function public.save_product_variant(
  p_variant_id uuid,
  p_organization_id uuid,
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_barcode text,
  p_cost numeric,
  p_price numeric,
  p_attribute_ids uuid[],
  p_value_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant_id uuid := coalesce(p_variant_id, gen_random_uuid());
  v_requested integer;
  v_valid integer;
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner','admin','manager','inventory']::public.membership_role[]
  ) then raise exception 'inventory permission denied'; end if;

  if not exists (
    select 1 from public.products
    where id = p_product_id and organization_id = p_organization_id and active
  ) then raise exception 'invalid product'; end if;

  if length(trim(p_name)) < 1 or (p_cost is not null and p_cost < 0)
    or (p_price is not null and p_price < 0) then
    raise exception 'invalid variant data';
  end if;

  if cardinality(coalesce(p_attribute_ids, array[]::uuid[]))
    <> cardinality(coalesce(p_value_ids, array[]::uuid[])) then
    raise exception 'invalid variant attributes';
  end if;

  select count(distinct attribute_id), count(*)
  into v_requested, v_valid
  from (
    select p_attribute_ids[i] attribute_id, p_value_ids[i] value_id
    from generate_subscripts(coalesce(p_attribute_ids, array[]::uuid[]), 1) i
  ) selected;
  if v_requested <> v_valid then raise exception 'duplicate variant attributes'; end if;

  select count(*) into v_valid
  from (
    select p_attribute_ids[i] attribute_id, p_value_ids[i] value_id
    from generate_subscripts(coalesce(p_attribute_ids, array[]::uuid[]), 1) i
  ) selected
  join public.product_attributes a on a.id = selected.attribute_id
    and a.organization_id = p_organization_id and a.active
  join public.product_attribute_values av on av.id = selected.value_id
    and av.attribute_id = selected.attribute_id
    and av.organization_id = p_organization_id and av.active;
  if v_requested <> v_valid then raise exception 'invalid variant attributes'; end if;

  if p_variant_id is null then
    insert into public.product_variants(id,organization_id,product_id,name,sku,barcode,cost,price)
    values(v_variant_id,p_organization_id,p_product_id,trim(p_name),nullif(trim(p_sku),''),nullif(trim(p_barcode),''),p_cost,p_price);
  else
    update public.product_variants set
      name=trim(p_name),sku=nullif(trim(p_sku),''),barcode=nullif(trim(p_barcode),''),
      cost=p_cost,price=p_price,updated_at=now()
    where id=p_variant_id and organization_id=p_organization_id and product_id=p_product_id and active;
    if not found then raise exception 'variant not found'; end if;
    delete from public.product_variant_values
    where variant_id=p_variant_id and organization_id=p_organization_id;
  end if;

  insert into public.product_variant_values(organization_id,variant_id,attribute_id,value_id)
  select p_organization_id,v_variant_id,p_attribute_ids[i],p_value_ids[i]
  from generate_subscripts(coalesce(p_attribute_ids,array[]::uuid[]),1) i;
  return v_variant_id;
end;
$$;

create or replace function public.deactivate_product_variant(
  p_variant_id uuid,
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
  ) then raise exception 'inventory permission denied'; end if;
  update public.product_variants set active=false,updated_at=now()
  where id=p_variant_id and organization_id=p_organization_id and active;
  if not found then raise exception 'variant not found'; end if;
end;
$$;

revoke all on function public.save_product_variant(uuid,uuid,uuid,text,text,text,numeric,numeric,uuid[],uuid[]) from public;
revoke all on function public.deactivate_product_variant(uuid,uuid) from public;
grant execute on function public.save_product_variant(uuid,uuid,uuid,text,text,text,numeric,numeric,uuid[],uuid[]) to authenticated;
grant execute on function public.deactivate_product_variant(uuid,uuid) to authenticated;
