create type public.product_relation_type as enum('related','accessory','alternative');

create table public.product_relations(
 organization_id uuid not null references public.organizations(id)on delete cascade,
 product_id uuid not null,
 related_product_id uuid not null,
 relation_type public.product_relation_type not null default'related',
 position integer not null default 0,
 created_by uuid references auth.users(id)on delete set null,
 created_at timestamptz not null default now(),
 primary key(product_id,related_product_id),
 foreign key(organization_id,product_id)references public.products(organization_id,id)on delete cascade,
 foreign key(organization_id,related_product_id)references public.products(organization_id,id)on delete cascade,
 check(product_id<>related_product_id)
);
create index product_relations_org_product_idx on public.product_relations(organization_id,product_id,position);
create index product_relations_related_idx on public.product_relations(related_product_id);
alter table public.product_relations enable row level security;

create policy "members read product relations" on public.product_relations for select to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles insert product relations" on public.product_relations for insert to authenticated with check(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles update product relations" on public.product_relations for update to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]))with check(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles delete product relations" on public.product_relations for delete to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));
