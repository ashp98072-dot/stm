create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  sale_id uuid not null references public.sales(id) on delete cascade,
  refund_method public.payment_method not null,
  total numeric(14,2) not null check (total > 0),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.sale_returns(id) on delete cascade deferrable initially deferred,
  sale_item_id uuid not null references public.sale_items(id),
  product_id uuid references public.products(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount > 0)
);

create index sale_returns_sale_idx on public.sale_returns (sale_id, created_at desc);
create index sale_return_items_sale_item_idx on public.sale_return_items (sale_item_id);
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
create policy "sales roles read returns" on public.sale_returns for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','viewer']::public.membership_role[]));
create policy "sales roles read return items" on public.sale_return_items for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','viewer']::public.membership_role[]));

create or replace function public.return_sale_items(p_sale_id uuid, p_reason text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.sales%rowtype; payment public.payments%rowtype; line record; requested record;
  returned_quantity numeric(14,3); refund numeric(14,2); refund_total numeric(14,2) := 0; return_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or length(trim(p_reason)) < 3 or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'invalid return'; end if;
  select * into target from public.sales where id = p_sale_id and status = 'completed' for update;
  if target.id is null or not (
    public.has_organization_role(target.organization_id, array['owner','admin','manager']::public.membership_role[])
    or (public.has_organization_role(target.organization_id, array['cashier']::public.membership_role[]) and target.cashier_id = auth.uid())
  ) then raise exception 'sale unavailable'; end if;
  select * into payment from public.payments where sale_id = p_sale_id order by received_at limit 1;

  create temporary table requested_returns(sale_item_id uuid primary key, quantity numeric(14,3)) on commit drop;
  insert into requested_returns select value.sale_item_id, sum(value.quantity) from jsonb_to_recordset(p_items) value(sale_item_id uuid, quantity numeric) group by value.sale_item_id;
  if exists(select 1 from requested_returns where quantity <= 0) then raise exception 'invalid quantity'; end if;

  for requested in select * from requested_returns loop
    select item.*, product.track_inventory into line from public.sale_items item left join public.products product on product.id=item.product_id where item.id=requested.sale_item_id and item.sale_id=p_sale_id for update of item;
    if line.id is null then raise exception 'invalid item'; end if;
    select coalesce(sum(quantity),0) into returned_quantity from public.sale_return_items where sale_item_id=line.id;
    if requested.quantity > line.quantity-returned_quantity then raise exception 'quantity exceeds available return'; end if;
    refund := round((line.line_total/line.quantity)*requested.quantity,2); refund_total := refund_total+refund;
    insert into public.sale_return_items(id,organization_id,return_id,sale_item_id,product_id,quantity,amount) values(gen_random_uuid(),target.organization_id,return_id,line.id,line.product_id,requested.quantity,refund);
    if line.product_id is not null and coalesce(line.track_inventory,false) then
      insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point) values(target.organization_id,target.location_id,line.product_id,requested.quantity,0) on conflict(location_id,product_id) do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
      insert into public.inventory_movements(organization_id,location_id,product_id,sale_id,quantity_delta,reason,performed_by) values(target.organization_id,target.location_id,line.product_id,p_sale_id,requested.quantity,'Devolución parcial',auth.uid());
    end if;
  end loop;

  insert into public.sale_returns(id,organization_id,location_id,sale_id,refund_method,total,reason,created_by) values(return_id,target.organization_id,target.location_id,p_sale_id,payment.method,refund_total,trim(p_reason),auth.uid());
  if payment.method='store_credit' and target.customer_id is not null then
    insert into public.customer_account_movements(organization_id,location_id,customer_id,type,amount,notes,created_by) values(target.organization_id,target.location_id,target.customer_id,'void',refund_total,'Devolución parcial '||target.receipt_number,auth.uid());
  end if;
  return return_id;
end;
$$;

revoke all on function public.return_sale_items(uuid,text,jsonb) from public;
grant execute on function public.return_sale_items(uuid,text,jsonb) to authenticated;
