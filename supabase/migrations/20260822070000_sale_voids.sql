create table public.sale_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null unique references public.sales(id) on delete cascade,
  reason text not null,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz not null default now()
);

alter table public.sale_voids enable row level security;
create policy "authorized users read sale voids" on public.sale_voids for select to authenticated
using (public.can_view_sale(sale_id));

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_sale public.sales%rowtype;
  item record;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(p_reason)) < 3 then raise exception 'void reason required'; end if;

  select * into target_sale from public.sales where id = p_sale_id for update;
  if target_sale.id is null or target_sale.status <> 'completed' then raise exception 'sale cannot be voided'; end if;
  if not (
    public.has_organization_role(target_sale.organization_id, array['owner','admin','manager']::public.membership_role[])
    or (public.has_organization_role(target_sale.organization_id, array['cashier']::public.membership_role[]) and target_sale.cashier_id = auth.uid())
  ) then raise exception 'insufficient permissions'; end if;

  for item in
    select sale_item.product_id, sale_item.quantity, product.track_inventory
    from public.sale_items sale_item
    left join public.products product on product.id = sale_item.product_id
    where sale_item.sale_id = p_sale_id
  loop
    if item.product_id is not null and coalesce(item.track_inventory, false) then
      insert into public.inventory_levels (organization_id, location_id, product_id, quantity, reorder_point)
      values (target_sale.organization_id, target_sale.location_id, item.product_id, item.quantity, 0)
      on conflict (location_id, product_id) do update
      set quantity = public.inventory_levels.quantity + excluded.quantity, updated_at = now();

      insert into public.inventory_movements (organization_id, location_id, product_id, sale_id, quantity_delta, reason, performed_by)
      values (target_sale.organization_id, target_sale.location_id, item.product_id, p_sale_id, item.quantity, 'Anulación de venta', auth.uid());
    end if;
  end loop;

  insert into public.sale_voids (organization_id, sale_id, reason, voided_by)
  values (target_sale.organization_id, p_sale_id, trim(p_reason), auth.uid());
  update public.sales set status = 'voided', updated_at = now() where id = p_sale_id;
end;
$$;

revoke all on function public.void_sale(uuid, text) from public;
grant execute on function public.void_sale(uuid, text) to authenticated;
