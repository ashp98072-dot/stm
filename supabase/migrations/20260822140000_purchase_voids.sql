create table public.purchase_voids(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 purchase_id uuid not null unique references public.purchases(id) on delete cascade,reason text not null,
 voided_by uuid references auth.users(id) on delete set null,voided_at timestamptz not null default now()
);
alter table public.purchase_voids enable row level security;
create policy "inventory roles read purchase voids" on public.purchase_voids for select to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory','viewer']::public.membership_role[]));

create or replace function public.void_purchase(p_purchase_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.purchases%rowtype;item record;available numeric(14,3);supplier_balance numeric(14,2);
begin
 if length(trim(p_reason))<3 then raise exception 'reason required';end if;
 select * into target from public.purchases where id=p_purchase_id for update;
 if target.id is null or target.status<>'received' then raise exception 'purchase unavailable';end if;
 if not public.has_organization_role(target.organization_id,array['owner','admin','manager']::public.membership_role[]) then raise exception 'insufficient permissions';end if;
 for item in select product_id,quantity,product_name from public.purchase_items where purchase_id=p_purchase_id loop
  if item.product_id is not null then
   select quantity into available from public.inventory_levels where location_id=target.location_id and product_id=item.product_id for update;
   if coalesce(available,0)<item.quantity then raise exception 'insufficient stock to reverse %',item.product_name;end if;
  end if;
 end loop;
 if target.payment_terms='credit' then
  select coalesce(sum(case type when 'charge' then amount else -amount end),0) into supplier_balance from public.supplier_account_movements where supplier_id=target.supplier_id;
  if supplier_balance<target.total then raise exception 'supplier balance already paid';end if;
 end if;
 for item in select product_id,quantity from public.purchase_items where purchase_id=p_purchase_id loop
  if item.product_id is not null then
   update public.inventory_levels set quantity=quantity-item.quantity,updated_at=now() where location_id=target.location_id and product_id=item.product_id;
   insert into public.inventory_movements(organization_id,location_id,product_id,quantity_delta,reason,performed_by)values(target.organization_id,target.location_id,item.product_id,-item.quantity,'Anulación de recepción '||coalesce(target.reference,target.id::text),auth.uid());
  end if;
 end loop;
 if target.payment_terms='credit' then
  insert into public.supplier_account_movements(organization_id,location_id,supplier_id,purchase_id,type,amount,notes,created_by)values(target.organization_id,target.location_id,target.supplier_id,target.id,'void',target.total,'Reversión por anulación de compra',auth.uid());
 end if;
 insert into public.purchase_voids(organization_id,purchase_id,reason,voided_by)values(target.organization_id,target.id,trim(p_reason),auth.uid());
 update public.purchases set status='voided' where id=target.id;
end;$$;
revoke all on function public.void_purchase(uuid,text) from public;
grant execute on function public.void_purchase(uuid,text) to authenticated;
