create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner', 'admin', 'manager', 'cashier', 'inventory', 'viewer');
create type public.sale_status as enum ('draft', 'completed', 'voided', 'refunded');
create type public.payment_method as enum ('cash', 'card', 'transfer', 'store_credit', 'other');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency_code char(3) not null default 'GTQ',
  timezone text not null default 'America/Guatemala',
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  legacy_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  legacy_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  company_name text,
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

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  sku text,
  barcode text,
  name text not null,
  description text,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  price numeric(14,2) not null default 0 check (price >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  track_inventory boolean not null default true,
  active boolean not null default true,
  legacy_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_levels (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  reorder_point numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  status public.sale_status not null default 'draft',
  receipt_number text,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  legacy_id bigint,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, receipt_number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric(14,3) not null check (quantity <> 0),
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  received_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  product_id uuid not null references public.products(id),
  sale_id uuid references public.sales(id) on delete set null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  reason text not null,
  performed_by uuid references auth.users(id) on delete set null,
  legacy_id bigint,
  created_at timestamptz not null default now()
);

create index customers_org_name_idx on public.customers (organization_id, last_name, first_name);
create index products_org_name_idx on public.products (organization_id, name);
create unique index products_org_sku_idx on public.products (organization_id, sku) where sku is not null;
create unique index products_org_barcode_idx on public.products (organization_id, barcode) where barcode is not null;
create index sales_org_created_idx on public.sales (organization_id, created_at desc);
create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid() and active
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_organization(organization_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(organization_name)) < 2 then raise exception 'organization name is too short'; end if;

  insert into public.organizations (name) values (trim(organization_name)) returning id into new_organization_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');
  insert into public.locations (organization_id, name) values (new_organization_id, 'Sucursal principal');
  return new_organization_id;
end;
$$;

revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger locations_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger inventory_levels_updated_at before update on public.inventory_levels for each row execute function public.set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_levels enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;

create policy "members read organizations" on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read memberships" on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));

do $$
declare table_name text;
begin
  foreach table_name in array array['locations','categories','customers','products','inventory_levels','sales','sale_items','payments','inventory_movements']
  loop
    execute format('create policy "members access %1$s" on public.%1$I for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id))', table_name);
  end loop;
end $$;
