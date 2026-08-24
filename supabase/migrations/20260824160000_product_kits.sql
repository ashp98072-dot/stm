create table public.product_kits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, product_id),
  foreign key (organization_id, product_id)
    references public.products(organization_id, id) on delete cascade
);

create table public.product_kit_items (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kit_id uuid not null,
  component_product_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (kit_id, component_product_id),
  foreign key (organization_id, kit_id)
    references public.product_kits(organization_id, id) on delete cascade,
  foreign key (organization_id, component_product_id)
    references public.products(organization_id, id)
);

create index product_kits_product_idx on public.product_kits(product_id) where active;
create index product_kit_items_component_idx on public.product_kit_items(component_product_id, kit_id);
create trigger product_kits_updated_at before update on public.product_kits
for each row execute function public.set_updated_at();

alter table public.product_kits enable row level security;
alter table public.product_kit_items enable row level security;

create policy "members read product kits" on public.product_kits for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product kits" on public.product_kits for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read product kit items" on public.product_kit_items for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product kit items" on public.product_kit_items for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create or replace function public.save_product_kit(
  p_organization_id uuid,
  p_product_id uuid,
  p_components jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kit_id uuid;
  v_requested integer;
  v_valid integer;
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['owner','admin','manager','inventory']::public.membership_role[]
  ) then raise exception 'inventory permission denied'; end if;

  if not exists(select 1 from public.products where id=p_product_id and organization_id=p_organization_id and active)
    then raise exception 'invalid kit product'; end if;

  select count(*),count(distinct component_id) into v_requested,v_valid
  from (select (item->>'product_id')::uuid component_id,(item->>'quantity')::numeric quantity from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) item) requested;
  if v_requested=0 or v_requested<>v_valid then raise exception 'invalid kit components'; end if;

  select count(*) into v_valid from (
    select (item->>'product_id')::uuid component_id,(item->>'quantity')::numeric quantity
    from jsonb_array_elements(p_components) item
  ) requested join public.products product on product.id=requested.component_id
    and product.organization_id=p_organization_id and product.active
  where requested.component_id<>p_product_id and requested.quantity>0
    and not exists(select 1 from public.product_kits nested where nested.product_id=requested.component_id and nested.active);
  if v_requested<>v_valid then raise exception 'invalid kit components'; end if;

  insert into public.product_kits(organization_id,product_id,active)
  values(p_organization_id,p_product_id,true)
  on conflict(organization_id,product_id) do update set active=true,updated_at=now()
  returning id into v_kit_id;
  delete from public.product_kit_items where kit_id=v_kit_id;
  insert into public.product_kit_items(organization_id,kit_id,component_product_id,quantity)
  select p_organization_id,v_kit_id,(item->>'product_id')::uuid,(item->>'quantity')::numeric
  from jsonb_array_elements(p_components) item;
  update public.products set track_inventory=false,updated_at=now()
  where id=p_product_id and organization_id=p_organization_id;
  return v_kit_id;
end;
$$;

create or replace function public.deactivate_product_kit(p_kit_id uuid,p_organization_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_organization_role(p_organization_id,array['owner','admin','manager','inventory']::public.membership_role[])
    then raise exception 'inventory permission denied'; end if;
  update public.product_kits set active=false,updated_at=now()
  where id=p_kit_id and organization_id=p_organization_id and active;
  if not found then raise exception 'kit not found'; end if;
end;$$;

revoke all on function public.save_product_kit(uuid,uuid,jsonb) from public;
revoke all on function public.deactivate_product_kit(uuid,uuid) from public;
grant execute on function public.save_product_kit(uuid,uuid,jsonb) to authenticated;
grant execute on function public.deactivate_product_kit(uuid,uuid) to authenticated;
