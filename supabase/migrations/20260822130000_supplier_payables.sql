create type public.supplier_account_movement_type as enum ('charge','payment','void');
alter table public.purchases add column payment_terms text not null default 'cash' check (payment_terms in ('cash','credit'));
create table public.supplier_account_movements(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 location_id uuid not null references public.locations(id), supplier_id uuid not null references public.suppliers(id), purchase_id uuid references public.purchases(id) on delete set null,
 type public.supplier_account_movement_type not null, amount numeric(14,2) not null check(amount>0), payment_method public.payment_method,
 reference text, notes text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 check((type='payment' and payment_method is not null and payment_method<>'store_credit') or (type<>'payment' and payment_method is null))
);
create unique index supplier_account_purchase_charge_idx on public.supplier_account_movements(purchase_id,type) where purchase_id is not null and type in('charge','void');
create index supplier_account_supplier_date_idx on public.supplier_account_movements(supplier_id,created_at desc);
alter table public.supplier_account_movements enable row level security;
create policy "inventory roles read supplier accounts" on public.supplier_account_movements for select to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory','viewer']::public.membership_role[]));

drop function if exists public.receive_purchase(uuid,uuid,uuid,text,jsonb);
create or replace function public.receive_purchase(p_organization_id uuid,p_location_id uuid,p_supplier_id uuid,p_reference text,p_payment_terms text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); purchase_id uuid:=gen_random_uuid(); subtotal numeric(14,2):=0; taxes numeric(14,2):=0; item record; product record;
begin
 if uid is null or not public.has_organization_role(p_organization_id,array['owner','admin','manager','inventory']::public.membership_role[]) then raise exception 'purchase permission denied';end if;
 if not exists(select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active) then raise exception 'invalid location';end if;
 if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and organization_id=p_organization_id and active) then raise exception 'invalid supplier';end if;
 if p_payment_terms not in('cash','credit') or (p_payment_terms='credit' and p_supplier_id is null) then raise exception 'supplier required for credit';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'items required';end if;
 create temporary table purchase_lines(product_id uuid primary key,quantity numeric(14,3),unit_cost numeric(14,2)) on commit drop;
 insert into purchase_lines select value.product_id,sum(value.quantity),max(value.unit_cost) from jsonb_to_recordset(p_items)value(product_id uuid,quantity numeric,unit_cost numeric) group by value.product_id;
 if exists(select 1 from purchase_lines where quantity<=0 or unit_cost<0) then raise exception 'invalid line';end if;
 for item in select * from purchase_lines loop
  select id,name,sku,tax_rate into product from public.products where id=item.product_id and organization_id=p_organization_id and active;
  if not found then raise exception 'invalid product';end if;
  subtotal:=subtotal+round(item.quantity*item.unit_cost,2);taxes:=taxes+round(item.quantity*item.unit_cost*product.tax_rate,2);
 end loop;
 insert into public.purchases(id,organization_id,location_id,supplier_id,received_by,reference,payment_terms,subtotal,tax_total,total)
 values(purchase_id,p_organization_id,p_location_id,p_supplier_id,uid,nullif(trim(p_reference),''),p_payment_terms,subtotal,taxes,subtotal+taxes);
 for item in select * from purchase_lines loop
  select id,name,sku,tax_rate into product from public.products where id=item.product_id;
  insert into public.purchase_items(organization_id,purchase_id,product_id,product_name,sku,quantity,unit_cost,tax_total,line_total) values(p_organization_id,purchase_id,product.id,product.name,product.sku,item.quantity,item.unit_cost,round(item.quantity*item.unit_cost*product.tax_rate,2),round(item.quantity*item.unit_cost*(1+product.tax_rate),2));
  insert into public.inventory_levels(organization_id,location_id,product_id,quantity,reorder_point)values(p_organization_id,p_location_id,product.id,item.quantity,0)on conflict(location_id,product_id)do update set quantity=public.inventory_levels.quantity+excluded.quantity,updated_at=now();
  update public.products set cost=item.unit_cost where id=product.id;
  insert into public.inventory_movements(organization_id,location_id,product_id,quantity_delta,reason,performed_by)values(p_organization_id,p_location_id,product.id,item.quantity,'Recepción '||coalesce(nullif(trim(p_reference),''),purchase_id::text),uid);
 end loop;
 if p_payment_terms='credit' then insert into public.supplier_account_movements(organization_id,location_id,supplier_id,purchase_id,type,amount,created_by)values(p_organization_id,p_location_id,p_supplier_id,purchase_id,'charge',subtotal+taxes,uid);end if;
 return purchase_id;
end;$$;

create or replace function public.record_supplier_payment(p_supplier_id uuid,p_location_id uuid,p_amount numeric,p_method text,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid;balance numeric(14,2);movement_id uuid;register_session_id uuid;
begin
 select organization_id into oid from public.suppliers where id=p_supplier_id and active;
 if oid is null or not public.has_organization_role(oid,array['owner','admin','manager']::public.membership_role[]) then raise exception 'insufficient permissions';end if;
 if not exists(select 1 from public.locations where id=p_location_id and organization_id=oid and active) then raise exception 'invalid location';end if;
 if p_amount<=0 or p_method not in('cash','card','transfer','other') then raise exception 'invalid payment';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_supplier_id::text,0));
 select coalesce(sum(case type when 'charge' then amount else -amount end),0) into balance from public.supplier_account_movements where supplier_id=p_supplier_id;
 if balance<=0 or p_amount>balance then raise exception 'payment exceeds balance';end if;
 insert into public.supplier_account_movements(organization_id,location_id,supplier_id,type,amount,payment_method,reference,notes,created_by)values(oid,p_location_id,p_supplier_id,'payment',p_amount,p_method::public.payment_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid())returning id into movement_id;
 if p_method='cash' then
  select id into register_session_id from public.cash_register_sessions where organization_id=oid and location_id=p_location_id and opened_by=auth.uid() and status='open' limit 1;
  if register_session_id is not null then
   insert into public.cash_register_movements(organization_id,session_id,type,amount,reason,created_by)
   values(oid,register_session_id,'withdrawal',p_amount,'Pago a proveedor',auth.uid());
  end if;
 end if;
 return movement_id;
end;$$;
revoke all on function public.receive_purchase(uuid,uuid,uuid,text,text,jsonb) from public;
revoke all on function public.record_supplier_payment(uuid,uuid,numeric,text,text,text) from public;
grant execute on function public.receive_purchase(uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.record_supplier_payment(uuid,uuid,numeric,text,text,text) to authenticated;
