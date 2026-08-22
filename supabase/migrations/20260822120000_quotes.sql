create type public.quote_status as enum ('draft', 'converted', 'cancelled');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  converted_sale_id uuid references public.sales(id) on delete set null,
  status public.quote_status not null default 'draft',
  quote_number text not null,
  subtotal numeric(14,2) not null,
  tax_total numeric(14,2) not null,
  total numeric(14,2) not null,
  notes text,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quote_number)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  tax_rate numeric(7,4) not null,
  tax_total numeric(14,2) not null,
  line_total numeric(14,2) not null
);

create index quotes_org_date_idx on public.quotes (organization_id, created_at desc);
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
create policy "customer roles read quotes" on public.quotes for select to authenticated using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','viewer']::public.membership_role[]));
create policy "customer roles read quote items" on public.quote_items for select to authenticated using (public.has_organization_role(organization_id, array['owner','admin','manager','cashier','viewer']::public.membership_role[]));

create or replace function public.create_quote(p_organization_id uuid, p_location_id uuid, p_customer_id uuid, p_valid_until date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare quote_id uuid := gen_random_uuid(); quote_number text; subtotal numeric(14,2) := 0; tax_total numeric(14,2) := 0; total numeric(14,2); item record; product record;
begin
  if not public.has_organization_role(p_organization_id, array['owner','admin','manager','cashier']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  if not exists (select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active) then raise exception 'invalid location'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id and active) then raise exception 'invalid customer'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'items required'; end if;
  create temporary table quote_lines (product_id uuid primary key, quantity numeric(14,3)) on commit drop;
  insert into quote_lines select value.product_id, sum(value.quantity) from jsonb_to_recordset(p_items) value(product_id uuid, quantity numeric) group by value.product_id;
  if exists(select 1 from quote_lines where quantity <= 0) then raise exception 'invalid quantity'; end if;
  for item in select * from quote_lines loop
    select id,name,sku,price,tax_rate into product from public.products where id=item.product_id and organization_id=p_organization_id and active;
    if not found then raise exception 'invalid product'; end if;
    subtotal := subtotal + round(product.price*item.quantity,2);
    tax_total := tax_total + round(product.price*item.quantity*product.tax_rate,2);
  end loop;
  total := subtotal+tax_total;
  quote_number := 'C-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(quote_id::text,'-',''),1,6));
  insert into public.quotes(id,organization_id,location_id,customer_id,created_by,quote_number,subtotal,tax_total,total,notes,valid_until)
  values(quote_id,p_organization_id,p_location_id,p_customer_id,auth.uid(),quote_number,subtotal,tax_total,total,nullif(trim(p_notes),''),p_valid_until);
  for item in select * from quote_lines loop
    select id,name,sku,price,tax_rate into product from public.products where id=item.product_id;
    insert into public.quote_items(organization_id,quote_id,product_id,product_name,sku,quantity,unit_price,tax_rate,tax_total,line_total)
    values(p_organization_id,quote_id,product.id,product.name,product.sku,item.quantity,product.price,product.tax_rate,round(product.price*item.quantity*product.tax_rate,2),round(product.price*item.quantity*(1+product.tax_rate),2));
  end loop;
  return quote_id;
end;
$$;

create or replace function public.convert_quote(p_quote_id uuid, p_sale_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_quote public.quotes%rowtype;
begin
  select * into target_quote from public.quotes where id=p_quote_id and status='draft' for update;
  if target_quote.id is null or not public.has_organization_role(target_quote.organization_id, array['owner','admin','manager','cashier']::public.membership_role[]) then raise exception 'quote unavailable'; end if;
  if not exists(select 1 from public.sales where id=p_sale_id and organization_id=target_quote.organization_id and status='completed') then raise exception 'sale unavailable'; end if;
  update public.quotes set status='converted', converted_sale_id=p_sale_id, updated_at=now() where id=p_quote_id;
end;
$$;

create or replace function public.cancel_quote(p_quote_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_organization_id uuid;
begin
  select organization_id into target_organization_id from public.quotes where id=p_quote_id and status='draft';
  if not public.has_organization_role(target_organization_id, array['owner','admin','manager','cashier']::public.membership_role[]) then raise exception 'insufficient permissions'; end if;
  update public.quotes set status='cancelled',updated_at=now() where id=p_quote_id;
end;
$$;

revoke all on function public.create_quote(uuid,uuid,uuid,date,text,jsonb) from public;
revoke all on function public.convert_quote(uuid,uuid) from public;
revoke all on function public.cancel_quote(uuid) from public;
grant execute on function public.create_quote(uuid,uuid,uuid,date,text,jsonb) to authenticated;
grant execute on function public.convert_quote(uuid,uuid) to authenticated;
grant execute on function public.cancel_quote(uuid) to authenticated;
