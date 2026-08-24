create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  website text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#285645' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.products
  add column manufacturer_id uuid references public.manufacturers(id) on delete set null;

alter table public.manufacturers add constraint manufacturers_org_id_unique unique (organization_id, id);
alter table public.tags add constraint tags_org_id_unique unique (organization_id, id);
alter table public.products add constraint products_org_id_unique unique (organization_id, id);
alter table public.products add constraint products_manufacturer_same_org
  foreign key (organization_id, manufacturer_id)
  references public.manufacturers(organization_id, id);

create table public.product_tags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, tag_id),
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id) references public.tags(organization_id, id) on delete cascade
);

create index manufacturers_org_name_idx on public.manufacturers(organization_id, name);
create index tags_org_name_idx on public.tags(organization_id, name);
create index product_tags_tag_idx on public.product_tags(tag_id, product_id);

create trigger manufacturers_updated_at before update on public.manufacturers
for each row execute function public.set_updated_at();
create trigger tags_updated_at before update on public.tags
for each row execute function public.set_updated_at();

alter table public.manufacturers enable row level security;
alter table public.tags enable row level security;
alter table public.product_tags enable row level security;

create policy "members read manufacturers" on public.manufacturers for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage manufacturers" on public.manufacturers for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read tags" on public.tags for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage tags" on public.tags for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read product tags" on public.product_tags for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage product tags" on public.product_tags for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));
