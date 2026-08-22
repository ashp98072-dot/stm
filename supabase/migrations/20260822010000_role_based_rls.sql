create or replace function public.has_organization_role(
  target_organization_id uuid,
  allowed_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and active
      and role = any(allowed_roles)
  );
$$;

create or replace function public.can_view_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sales sale
    join public.organization_members member on member.organization_id = sale.organization_id
    where sale.id = target_sale_id
      and member.user_id = auth.uid()
      and member.active
      and (
        member.role in ('owner', 'admin', 'manager', 'viewer')
        or sale.cashier_id = auth.uid()
      )
  );
$$;

revoke all on function public.has_organization_role(uuid, public.membership_role[]) from public;
revoke all on function public.can_view_sale(uuid) from public;
grant execute on function public.has_organization_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.can_view_sale(uuid) to authenticated;

drop policy if exists "members access locations" on public.locations;
drop policy if exists "members access categories" on public.categories;
drop policy if exists "members access customers" on public.customers;
drop policy if exists "members access products" on public.products;
drop policy if exists "members access inventory_levels" on public.inventory_levels;
drop policy if exists "members access sales" on public.sales;
drop policy if exists "members access sale_items" on public.sale_items;
drop policy if exists "members access payments" on public.payments;
drop policy if exists "members access inventory_movements" on public.inventory_movements;

create policy "members read locations" on public.locations for select to authenticated
using (public.is_organization_member(organization_id));
create policy "inventory roles manage locations" on public.locations for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]));

create policy "members read categories" on public.categories for select to authenticated
using (public.is_organization_member(organization_id));
create policy "inventory roles manage categories" on public.categories for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read products" on public.products for select to authenticated
using (public.is_organization_member(organization_id));
create policy "inventory roles manage products" on public.products for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read inventory" on public.inventory_levels for select to authenticated
using (public.is_organization_member(organization_id));
create policy "inventory roles manage inventory" on public.inventory_levels for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "members read customers" on public.customers for select to authenticated
using (public.is_organization_member(organization_id));
create policy "customer roles manage customers" on public.customers for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager','cashier']::public.membership_role[]));

create policy "authorized users read sales" on public.sales for select to authenticated
using (public.can_view_sale(id));
create policy "authorized users read sale items" on public.sale_items for select to authenticated
using (public.can_view_sale(sale_id));
create policy "authorized users read payments" on public.payments for select to authenticated
using (public.can_view_sale(sale_id));

create policy "inventory roles read movements" on public.inventory_movements for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','inventory','viewer']::public.membership_role[]));
create policy "inventory roles add movements" on public.inventory_movements for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "admins update organization" on public.organizations for update to authenticated
using (public.has_organization_role(id, array['owner','admin']::public.membership_role[]))
with check (public.has_organization_role(id, array['owner','admin']::public.membership_role[]));
