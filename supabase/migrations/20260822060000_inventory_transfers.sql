create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_location_id uuid not null references public.locations(id),
  destination_location_id uuid not null references public.locations(id),
  reference text,
  notes text,
  transferred_by uuid references auth.users(id) on delete set null,
  transferred_at timestamptz not null default now(),
  check (source_location_id <> destination_location_id)
);

create table public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (transfer_id, product_id)
);

create index inventory_transfers_org_date_idx on public.inventory_transfers (organization_id, transferred_at desc);
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;

create policy "inventory roles read transfers" on public.inventory_transfers for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory','viewer']::public.membership_role[]));
create policy "inventory roles read transfer items" on public.inventory_transfer_items for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory','viewer']::public.membership_role[]));

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
  new_transfer_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric(14,3);
  item_name text;
  available_quantity numeric(14,3);
begin
  if not public.has_organization_role(p_organization_id, array['owner','admin','manager','inventory']::public.membership_role[])
    then raise exception 'insufficient permissions'; end if;
  if p_source_location_id = p_destination_location_id then raise exception 'locations must differ'; end if;
  if not exists (select 1 from public.locations where id = p_source_location_id and organization_id = p_organization_id and active)
    or not exists (select 1 from public.locations where id = p_destination_location_id and organization_id = p_organization_id and active)
    then raise exception 'location unavailable'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'items required'; end if;

  insert into public.inventory_transfers (organization_id, source_location_id, destination_location_id, reference, notes, transferred_by)
  values (p_organization_id, p_source_location_id, p_destination_location_id, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid())
  returning id into new_transfer_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_product_id := (item ->> 'product_id')::uuid;
    item_quantity := (item ->> 'quantity')::numeric;
    if item_quantity <= 0 then raise exception 'invalid quantity'; end if;
    select name into item_name from public.products where id = item_product_id and organization_id = p_organization_id and active for update;
    if item_name is null then raise exception 'product unavailable'; end if;

    select quantity into available_quantity from public.inventory_levels
    where organization_id = p_organization_id and location_id = p_source_location_id and product_id = item_product_id for update;
    if coalesce(available_quantity, 0) < item_quantity then raise exception 'insufficient stock for %', item_name; end if;

    update public.inventory_levels set quantity = quantity - item_quantity, updated_at = now()
    where location_id = p_source_location_id and product_id = item_product_id;
    insert into public.inventory_levels (organization_id, location_id, product_id, quantity, reorder_point)
    values (p_organization_id, p_destination_location_id, item_product_id, item_quantity, 0)
    on conflict (location_id, product_id) do update set quantity = public.inventory_levels.quantity + excluded.quantity, updated_at = now();

    insert into public.inventory_transfer_items (organization_id, transfer_id, product_id, product_name, quantity)
    values (p_organization_id, new_transfer_id, item_product_id, item_name, item_quantity);
    insert into public.inventory_movements (organization_id, location_id, product_id, quantity_delta, reason, performed_by)
    values
      (p_organization_id, p_source_location_id, item_product_id, -item_quantity, 'Transferencia enviada ' || new_transfer_id::text, auth.uid()),
      (p_organization_id, p_destination_location_id, item_product_id, item_quantity, 'Transferencia recibida ' || new_transfer_id::text, auth.uid());
  end loop;
  return new_transfer_id;
end;
$$;

revoke all on function public.transfer_inventory(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, text, text, jsonb) to authenticated;
