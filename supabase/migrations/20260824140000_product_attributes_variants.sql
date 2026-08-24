create table public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attribute_id uuid not null,
  value text not null,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, attribute_id, value),
  unique (organization_id, id),
  unique (organization_id, attribute_id, id),
  foreign key (organization_id, attribute_id)
    references public.product_attributes(organization_id, id) on delete cascade
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null,
  name text not null,
  sku text,
  barcode text,
  cost numeric(14,2),
  price numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sku),
  unique (organization_id, barcode),
  foreign key (organization_id, product_id)
    references public.products(organization_id, id) on delete cascade,
  check (cost is null or cost >= 0),
  check (price is null or price >= 0)
);

create table public.product_variant_values (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  variant_id uuid not null,
  attribute_id uuid not null,
  value_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (variant_id, attribute_id),
  foreign key (organization_id, variant_id)
    references public.product_variants(organization_id, id) on delete cascade,
  foreign key (organization_id, attribute_id)
    references public.product_attributes(organization_id, id) on delete cascade,
  foreign key (organization_id, attribute_id, value_id)
    references public.product_attribute_values(organization_id, attribute_id, id) on delete cascade
);

create index product_attributes_org_name_idx on public.product_attributes(organization_id, name);
create index product_attribute_values_attribute_idx on public.product_attribute_values(attribute_id, position, value);
create index product_variants_product_idx on public.product_variants(product_id, active, name);
create index product_variant_values_value_idx on public.product_variant_values(value_id, variant_id);

create trigger product_attributes_updated_at before update on public.product_attributes
for each row execute function public.set_updated_at();
create trigger product_variants_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();

alter table public.product_attributes enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_values enable row level security;

create policy "members read product attributes" on public.product_attributes for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product attributes" on public.product_attributes for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read product attribute values" on public.product_attribute_values for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product attribute values" on public.product_attribute_values for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read product variants" on public.product_variants for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product variants" on public.product_variants for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read product variant values" on public.product_variant_values for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product variant values" on public.product_variant_values for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));
