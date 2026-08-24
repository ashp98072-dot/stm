create table public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  purchase_id uuid not null references public.purchases(id),
  supplier_id uuid references public.suppliers(id),
  total numeric(14,2) not null check (total > 0),
  resolution text not null check (resolution in ('supplier_credit','cash','transfer','other')),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_item_id uuid not null references public.purchase_items(id),
  product_id uuid references public.products(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  amount numeric(14,2) not null check (amount > 0)
);

create index purchase_returns_purchase_idx on public.purchase_returns(purchase_id,created_at desc);
create index purchase_return_items_line_idx on public.purchase_return_items(purchase_item_id);
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_items enable row level security;
create policy "inventory roles read purchase returns" on public.purchase_returns for select to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory','viewer']::public.membership_role[]));
create policy "inventory roles read purchase return items" on public.purchase_return_items for select to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory','viewer']::public.membership_role[]));

drop index if exists public.supplier_account_purchase_charge_idx;
create unique index supplier_account_purchase_charge_idx on public.supplier_account_movements(purchase_id) where purchase_id is not null and type='charge';

create or replace function public.return_purchase_items(p_purchase_id uuid,p_reason text,p_resolution text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.purchases%rowtype; requested record; line public.purchase_items%rowtype; returned_quantity numeric(14,3); available numeric(14,3); refund numeric(14,2); total_refund numeric(14,2):=0; return_id uuid:=gen_random_uuid(); supplier_balance numeric(14,2);
begin
 if length(trim(p_reason))<3 or p_resolution not in('supplier_credit','cash','transfer','other') then raise exception 'invalid return';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'items required';end if;
 select * into target from public.purchases where id=p_purchase_id for update;
 if target.id is null or target.status<>'received' then raise exception 'purchase unavailable';end if;
 if not public.has_organization_role(target.organization_id,array['owner','admin','manager','inventory']::public.membership_role[]) then raise exception 'insufficient permissions';end if;
 if target.payment_terms='credit' and p_resolution<>'supplier_credit' then raise exception 'credit purchase requires supplier credit';end if;
 if target.payment_terms='credit' and target.supplier_id is null then raise exception 'supplier required';end if;
 create temporary table requested_returns(purchase_item_id uuid primary key,quantity numeric(14,3)) on commit drop;
 insert into requested_returns select value.purchase_item_id,sum(value.quantity) from jsonb_to_recordset(p_items)value(purchase_item_id uuid,quantity numeric) group by value.purchase_item_id;
 if exists(select 1 from requested_returns where quantity<=0) then raise exception 'invalid quantity';end if;
 for requested in select * from requested_returns loop
  select * into line from public.purchase_items where id=requested.purchase_item_id and purchase_id=target.id for update;
  if line.id is null or line.product_id is null then raise exception 'invalid purchase item';end if;
  select coalesce(sum(quantity),0) into returned_quantity from public.purchase_return_items where purchase_item_id=line.id;
  if returned_quantity+requested.quantity>line.quantity then raise exception 'return quantity exceeds purchase';end if;
  select quantity into available from public.inventory_levels where location_id=target.location_id and product_id=line.product_id for update;
  if coalesce(available,0)<requested.quantity then raise exception 'insufficient stock for %',line.product_name;end if;
  refund:=round(line.line_total*requested.quantity/line.quantity,2);total_refund:=total_refund+refund;
 end loop;
 if total_refund<=0 then raise exception 'invalid refund';end if;
 if target.payment_terms='credit' then
  select coalesce(sum(case type when 'charge' then amount else -amount end),0) into supplier_balance from public.supplier_account_movements where supplier_id=target.supplier_id;
  if supplier_balance<total_refund then raise exception 'supplier balance already paid';end if;
 end if;
 insert into public.purchase_returns(id,organization_id,location_id,purchase_id,supplier_id,total,resolution,reason,created_by) values(return_id,target.organization_id,target.location_id,target.id,target.supplier_id,total_refund,p_resolution,trim(p_reason),auth.uid());
 for requested in select * from requested_returns loop
  select * into line from public.purchase_items where id=requested.purchase_item_id;
  refund:=round(line.line_total*requested.quantity/line.quantity,2);
  insert into public.purchase_return_items(organization_id,return_id,purchase_item_id,product_id,quantity,amount) values(target.organization_id,return_id,line.id,line.product_id,requested.quantity,refund);
  update public.inventory_levels set quantity=quantity-requested.quantity,updated_at=now() where location_id=target.location_id and product_id=line.product_id;
  insert into public.inventory_movements(organization_id,location_id,product_id,quantity_delta,reason,performed_by) values(target.organization_id,target.location_id,line.product_id,-requested.quantity,'Devolución a proveedor '||coalesce(target.reference,target.id::text),auth.uid());
 end loop;
 if target.payment_terms='credit' then insert into public.supplier_account_movements(organization_id,location_id,supplier_id,purchase_id,type,amount,notes,created_by) values(target.organization_id,target.location_id,target.supplier_id,target.id,'void',total_refund,'Devolución parcial a proveedor',auth.uid());end if;
 return return_id;
end;$$;
revoke all on function public.return_purchase_items(uuid,text,text,jsonb) from public;
grant execute on function public.return_purchase_items(uuid,text,text,jsonb) to authenticated;
