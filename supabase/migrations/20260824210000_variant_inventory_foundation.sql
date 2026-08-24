create table public.variant_inventory_levels(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  variant_id uuid not null,
  quantity numeric(14,3) not null default 0 check(quantity>=0),
  reorder_point numeric(14,3) not null default 0 check(reorder_point>=0),
  updated_at timestamptz not null default now(),
  primary key(location_id,variant_id),
  foreign key(organization_id,variant_id)references public.product_variants(organization_id,id)on delete cascade
);
create index variant_inventory_variant_idx on public.variant_inventory_levels(variant_id,location_id);
create trigger variant_inventory_levels_updated_at before update on public.variant_inventory_levels for each row execute function public.set_updated_at();
alter table public.variant_inventory_levels enable row level security;
create policy "members read variant inventory" on public.variant_inventory_levels for select to authenticated
using(public.has_organization_role(organization_id,array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles manage variant inventory" on public.variant_inventory_levels for all to authenticated
using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]))
with check(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));

alter table public.sale_items add column variant_id uuid;
alter table public.purchase_items add column variant_id uuid;
alter table public.inventory_movements add column variant_id uuid;
alter table public.sale_items add constraint sale_items_variant_same_org foreign key(organization_id,variant_id)references public.product_variants(organization_id,id)on delete set null;
alter table public.purchase_items add constraint purchase_items_variant_same_org foreign key(organization_id,variant_id)references public.product_variants(organization_id,id)on delete set null;
alter table public.inventory_movements add constraint inventory_movements_variant_same_org foreign key(organization_id,variant_id)references public.product_variants(organization_id,id)on delete set null;
create index sale_items_variant_idx on public.sale_items(variant_id)where variant_id is not null;
create index purchase_items_variant_idx on public.purchase_items(variant_id)where variant_id is not null;
create index inventory_movements_variant_idx on public.inventory_movements(variant_id,created_at desc)where variant_id is not null;

create or replace function public.adjust_variant_inventory(
  p_organization_id uuid,p_location_id uuid,p_variant_id uuid,p_quantity numeric,p_reorder_point numeric,p_reason text
)
returns void language plpgsql security definer set search_path='' as $$
declare v_previous numeric(14,3);v_product_id uuid;
begin
  if auth.uid()is null or not public.has_organization_role(p_organization_id,array['owner','admin','manager','inventory']::public.membership_role[])then raise exception 'inventory permission denied';end if;
  if p_quantity<0 or p_reorder_point<0 then raise exception 'invalid quantity';end if;
  select product_id into v_product_id from public.product_variants where id=p_variant_id and organization_id=p_organization_id and active;
  if v_product_id is null or not exists(select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active)then raise exception 'invalid variant or location';end if;
  select quantity into v_previous from public.variant_inventory_levels where location_id=p_location_id and variant_id=p_variant_id for update;
  insert into public.variant_inventory_levels(organization_id,location_id,variant_id,quantity,reorder_point)values(p_organization_id,p_location_id,p_variant_id,p_quantity,p_reorder_point)
  on conflict(location_id,variant_id)do update set quantity=excluded.quantity,reorder_point=excluded.reorder_point,updated_at=now();
  if p_quantity<>coalesce(v_previous,0)then insert into public.inventory_movements(organization_id,location_id,product_id,variant_id,quantity_delta,reason,performed_by)values(p_organization_id,p_location_id,v_product_id,p_variant_id,p_quantity-coalesce(v_previous,0),coalesce(nullif(trim(p_reason),''),'Ajuste de variante'),auth.uid());end if;
end;$$;
revoke all on function public.adjust_variant_inventory(uuid,uuid,uuid,numeric,numeric,text)from public;
grant execute on function public.adjust_variant_inventory(uuid,uuid,uuid,numeric,numeric,text)to authenticated;
