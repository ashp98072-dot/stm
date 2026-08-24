create type public.price_rule_adjustment as enum('percent_discount','fixed_discount','fixed_price');

alter table public.categories add constraint categories_org_id_unique unique(organization_id,id);

create table public.price_rules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  product_id uuid,
  category_id uuid,
  tag_id uuid,
  adjustment public.price_rule_adjustment not null,
  value numeric(14,2) not null check(value>=0),
  minimum_quantity numeric(14,3) not null default 1 check(minimum_quantity>0),
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,name),
  foreign key(organization_id,product_id) references public.products(organization_id,id) on delete cascade,
  foreign key(organization_id,category_id) references public.categories(organization_id,id) on delete cascade,
  foreign key(organization_id,tag_id) references public.tags(organization_id,id) on delete cascade,
  check(num_nonnulls(product_id,category_id,tag_id)<=1),
  check(ends_at is null or starts_at is null or ends_at>starts_at),
  check(adjustment<>'percent_discount' or value<=100)
);
create index price_rules_lookup_idx on public.price_rules(organization_id,active,priority desc,minimum_quantity desc);
create index price_rules_product_idx on public.price_rules(product_id)where active;
create index price_rules_category_idx on public.price_rules(category_id)where active;
create index price_rules_tag_idx on public.price_rules(tag_id)where active;
create trigger price_rules_updated_at before update on public.price_rules for each row execute function public.set_updated_at();
alter table public.price_rules enable row level security;
create policy "members read price rules" on public.price_rules for select to authenticated
using(public.has_organization_role(organization_id,array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "managers manage price rules" on public.price_rules for all to authenticated
using(public.has_organization_role(organization_id,array['owner','admin','manager']::public.membership_role[]))
with check(public.has_organization_role(organization_id,array['owner','admin','manager']::public.membership_role[]));

create or replace function public.product_rule_price(
  p_organization_id uuid,p_product_id uuid,p_quantity numeric,p_at timestamptz default now()
)
returns numeric language sql stable security invoker set search_path='' as $$
  with product_data as(
    select id,category_id,price from public.products where id=p_product_id and organization_id=p_organization_id and active
  ),selected as(
    select rule.adjustment,rule.value,product.price
    from product_data product join public.price_rules rule on rule.organization_id=p_organization_id and rule.active
      and rule.minimum_quantity<=p_quantity and(rule.starts_at is null or rule.starts_at<=p_at)and(rule.ends_at is null or rule.ends_at>p_at)
      and(rule.product_id=product.id or rule.category_id=product.category_id or(rule.tag_id is not null and exists(select 1 from public.product_tags link where link.product_id=product.id and link.tag_id=rule.tag_id))or(rule.product_id is null and rule.category_id is null and rule.tag_id is null))
    order by rule.priority desc,rule.minimum_quantity desc,rule.created_at asc limit 1
  )
  select greatest(0,round(case selected.adjustment when'percent_discount'then selected.price*(1-selected.value/100)when'fixed_discount'then selected.price-selected.value when'fixed_price'then selected.value end,2))from selected
  union all select price from product_data where not exists(select 1 from selected)limit 1;
$$;
revoke all on function public.product_rule_price(uuid,uuid,numeric,timestamptz)from public;
grant execute on function public.product_rule_price(uuid,uuid,numeric,timestamptz)to authenticated;
