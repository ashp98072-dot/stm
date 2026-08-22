create type public.purchase_status as enum ('received', 'voided');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  tax_id text,
  address text,
  notes text,
  active boolean not null default true,
  legacy_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  supplier_id uuid references public.suppliers(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  status public.purchase_status not null default 'received',
  reference text,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  tax_total numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create index suppliers_org_name_idx on public.suppliers (organization_id, name);
create index purchases_org_received_idx on public.purchases (organization_id, received_at desc);
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "members read suppliers" on public.suppliers for select to authenticated
using (public.is_organization_member(organization_id));
create policy "inventory roles manage suppliers" on public.suppliers for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles read purchases" on public.purchases for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory','viewer']::public.membership_role[]));
create policy "inventory roles read purchase items" on public.purchase_items for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory','viewer']::public.membership_role[]));

create or replace function public.receive_purchase(
  p_organization_id uuid,
  p_location_id uuid,
  p_supplier_id uuid,
  p_reference text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase_id uuid := gen_random_uuid();
  v_subtotal numeric(14,2) := 0;
  v_tax_total numeric(14,2) := 0;
  v_item record;
  v_product record;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not public.has_organization_role(p_organization_id, array['owner','admin','manager','inventory']::public.membership_role[])
    then raise exception 'purchase permission denied'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and organization_id = p_organization_id and active)
    then raise exception 'invalid location'; end if;
  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = p_organization_id and active)
    then raise exception 'invalid supplier'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'purchase requires items'; end if;

  create temporary table purchase_lines (
    product_id uuid primary key,
    quantity numeric(14,3) not null,
    unit_cost numeric(14,2) not null
  ) on commit drop;
  insert into purchase_lines (product_id, quantity, unit_cost)
  select item.product_id, sum(item.quantity), max(item.unit_cost)
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_cost numeric)
  group by item.product_id;
  if exists (select 1 from purchase_lines where quantity <= 0 or unit_cost < 0) then raise exception 'invalid purchase line'; end if;

  for v_item in select * from purchase_lines loop
    select id, name, sku, tax_rate into v_product from public.products
      where id = v_item.product_id and organization_id = p_organization_id and active;
    if not found then raise exception 'invalid product'; end if;
    v_subtotal := v_subtotal + round(v_item.quantity * v_item.unit_cost, 2);
    v_tax_total := v_tax_total + round(v_item.quantity * v_item.unit_cost * v_product.tax_rate, 2);
  end loop;

  insert into public.purchases (id, organization_id, location_id, supplier_id, received_by, reference, subtotal, tax_total, total)
  values (v_purchase_id, p_organization_id, p_location_id, p_supplier_id, nullif(trim(p_reference), ''), v_subtotal, v_tax_total, v_subtotal + v_tax_total);

  for v_item in select * from purchase_lines loop
    select id, name, sku, tax_rate into v_product from public.products where id = v_item.product_id;
    insert into public.purchase_items (organization_id, purchase_id, product_id, product_name, sku, quantity, unit_cost, tax_total, line_total)
    values (p_organization_id, v_purchase_id, v_product.id, v_product.name, v_product.sku, v_item.quantity, v_item.unit_cost,
      round(v_item.quantity * v_item.unit_cost * v_product.tax_rate, 2), round(v_item.quantity * v_item.unit_cost * (1 + v_product.tax_rate), 2));
    insert into public.inventory_levels (organization_id, location_id, product_id, quantity, reorder_point)
    values (p_organization_id, p_location_id, v_product.id, v_item.quantity, 0)
    on conflict (location_id, product_id) do update set quantity = public.inventory_levels.quantity + excluded.quantity;
    update public.products set cost = v_item.unit_cost where id = v_product.id;
    insert into public.inventory_movements (organization_id, location_id, product_id, quantity_delta, reason, performed_by)
    values (p_organization_id, p_location_id, v_product.id, v_item.quantity, 'Recepción ' || coalesce(nullif(trim(p_reference), ''), v_purchase_id::text), v_user_id);
  end loop;
  return v_purchase_id;
end;
$$;

revoke all on function public.receive_purchase(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.receive_purchase(uuid, uuid, uuid, text, jsonb) to authenticated;
