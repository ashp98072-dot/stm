create table public.sale_item_components (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  component_product_id uuid not null references public.products(id),
  quantity_per_unit numeric(14,3) not null check(quantity_per_unit>0),
  created_at timestamptz not null default now(),
  primary key(sale_item_id,component_product_id)
);
create index sale_item_components_product_idx on public.sale_item_components(component_product_id,sale_item_id);
alter table public.sale_item_components enable row level security;
create policy "sales roles read sale item components" on public.sale_item_components for select to authenticated
using(public.has_organization_role(organization_id,array['owner','admin','manager','cashier','viewer']::public.membership_role[]));

create or replace function public.snapshot_sale_item_components()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.sale_item_components(organization_id,sale_item_id,component_product_id,quantity_per_unit)
  select new.organization_id,new.id,item.component_product_id,item.quantity
  from public.product_kits kit join public.product_kit_items item on item.kit_id=kit.id
  where kit.organization_id=new.organization_id and kit.product_id=new.product_id and kit.active
  on conflict(sale_item_id,component_product_id)do nothing;
  return new;
end;$$;
create trigger snapshot_sale_item_components_after_insert after insert on public.sale_items
for each row execute function public.snapshot_sale_item_components();

insert into public.sale_item_components(organization_id,sale_item_id,component_product_id,quantity_per_unit)
select sale_item.organization_id,sale_item.id,item.component_product_id,item.quantity
from public.sale_items sale_item join public.product_kits kit on kit.product_id=sale_item.product_id and kit.organization_id=sale_item.organization_id and kit.active
join public.product_kit_items item on item.kit_id=kit.id
on conflict(sale_item_id,component_product_id)do nothing;

create or replace function public.return_sale_items(p_sale_id uuid,p_reason text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.sales%rowtype;payment public.payments%rowtype;line record;requested record;component record;returned_quantity numeric(14,3);refund numeric(14,2);refund_total numeric(14,2):=0;return_id uuid:=gen_random_uuid();
begin
  if auth.uid()is null or length(trim(p_reason))<3 or jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)=0 then raise exception 'invalid return';end if;
  select*into target from public.sales where id=p_sale_id and status='completed'for update;
  if target.id is null or not(public.has_organization_role(target.organization_id,array['owner','admin','manager']::public.membership_role[])or(public.has_organization_role(target.organization_id,array['cashier']::public.membership_role[])and target.cashier_id=auth.uid()))then raise exception 'sale unavailable';end if;
  select*into payment from public.payments where sale_id=p_sale_id order by received_at limit 1;
  create temporary table requested_returns(sale_item_id uuid primary key,quantity numeric(14,3))on commit drop;
  insert into requested_returns select value.sale_item_id,sum(value.quantity)from jsonb_to_recordset(p_items)value(sale_item_id uuid,quantity numeric)group by value.sale_item_id;
  if exists(select 1 from requested_returns where quantity<=0)then raise exception 'invalid quantity';end if;
  for requested in select*from requested_returns loop
    select item.*,product.track_inventory into line from public.sale_items item left join public.products product on product.id=item.product_id where item.id=requested.sale_item_id and item.sale_id=p_sale_id for update of item;
    if line.id is null then raise exception 'invalid item';end if;select coalesce(sum(quantity),0)into returned_quantity from public.sale_return_items where sale_item_id=line.id;
    if requested.quantity>line.quantity-returned_quantity then raise exception 'quantity exceeds available return';end if;
    refund:=round((line.line_total/line.quantity)*requested.quantity,2);refund_total:=refund_total+refund;
    insert into public.sale_return_items(id,organization_id,return_id,sale_item_id,product_id,quantity,amount)values(gen_random_uuid(),target.organization_id,return_id,line.id,line.product_id,requested.quantity,refund);
    if exists(select 1 from public.sale_item_components where sale_item_id=line.id)then
      for component in select component_product_id,quantity_per_unit*requested.quantity quantity from public.sale_item_components where sale_item_id=line.id order by component_product_id loop
        insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)values(target.organization_id,target.location_id,component.component_product_id,component.quantity,0)on conflict(location_id,product_id)do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
        insert into public.inventory_movements(organization_id,location_id,product_id,sale_id,quantity_delta,reason,performed_by)values(target.organization_id,target.location_id,component.component_product_id,p_sale_id,component.quantity,'Devolución parcial de kit',auth.uid());
      end loop;
    elsif line.product_id is not null and coalesce(line.track_inventory,false)then
      insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)values(target.organization_id,target.location_id,line.product_id,requested.quantity,0)on conflict(location_id,product_id)do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
      insert into public.inventory_movements(organization_id,location_id,product_id,sale_id,quantity_delta,reason,performed_by)values(target.organization_id,target.location_id,line.product_id,p_sale_id,requested.quantity,'Devolución parcial',auth.uid());
    end if;
  end loop;
  insert into public.sale_returns(id,organization_id,location_id,sale_id,refund_method,total,reason,created_by)values(return_id,target.organization_id,target.location_id,p_sale_id,payment.method,refund_total,trim(p_reason),auth.uid());
  if payment.method='store_credit'and target.customer_id is not null then insert into public.customer_account_movements(organization_id,location_id,customer_id,type,amount,notes,created_by)values(target.organization_id,target.location_id,target.customer_id,'void',refund_total,'Devolución parcial '||target.receipt_number,auth.uid());end if;
  return return_id;
end;$$;

revoke all on function public.return_sale_items(uuid,text,jsonb) from public;
grant execute on function public.return_sale_items(uuid,text,jsonb) to authenticated;
