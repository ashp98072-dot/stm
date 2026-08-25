create or replace function public.create_quote(p_organization_id uuid,p_location_id uuid,p_customer_id uuid,p_valid_until date,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare quote_id uuid:=gen_random_uuid();quote_number text;subtotal numeric(14,2):=0;tax_total numeric(14,2):=0;total numeric(14,2);item record;
begin
 if not public.has_organization_role(p_organization_id,array['owner','admin','manager','cashier']::public.membership_role[])then raise exception 'insufficient permissions';end if;
 if not exists(select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and active)then raise exception 'invalid location';end if;
 if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id and active)then raise exception 'invalid customer';end if;
 if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)=0 then raise exception 'items required';end if;
 create temporary table quote_lines(line_key text primary key,product_id uuid not null,variant_id uuid,quantity numeric(14,3)not null,product_name text,sku text,unit_price numeric(14,2),tax_rate numeric(7,4))on commit drop;
 insert into quote_lines(line_key,product_id,variant_id,quantity)select value.product_id::text||':'||coalesce(value.variant_id::text,'base'),value.product_id,value.variant_id,sum(value.quantity)from jsonb_to_recordset(p_items)value(product_id uuid,variant_id uuid,quantity numeric)group by value.product_id,value.variant_id;
 if exists(select 1 from quote_lines where quantity<=0)then raise exception 'invalid quantity';end if;

 update quote_lines target set product_name=product.name,sku=product.sku,unit_price=public.product_rule_price(p_organization_id,product.id,target.quantity,now()),tax_rate=product.tax_rate
 from public.products product where target.variant_id is null and product.id=target.product_id and product.organization_id=p_organization_id and product.active;

 update quote_lines target set product_name=product.name||' · '||variant.name,sku=coalesce(variant.sku,product.sku),unit_price=coalesce(variant.price,public.product_rule_price(p_organization_id,product.id,target.quantity,now())),tax_rate=product.tax_rate
 from public.products product,public.product_variants variant where target.variant_id is not null and product.id=target.product_id and product.organization_id=p_organization_id and product.active and variant.id=target.variant_id and variant.product_id=product.id and variant.organization_id=p_organization_id and variant.active;

 if exists(select 1 from quote_lines where unit_price is null)then raise exception 'invalid product or variant';end if;
 select coalesce(sum(round(unit_price*quantity,2)),0),coalesce(sum(round(unit_price*quantity*tax_rate,2)),0)into subtotal,tax_total from quote_lines;total:=subtotal+tax_total;quote_number:='C-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(quote_id::text,'-',''),1,6));
 insert into public.quotes(id,organization_id,location_id,customer_id,created_by,quote_number,subtotal,tax_total,total,notes,valid_until)values(quote_id,p_organization_id,p_location_id,p_customer_id,auth.uid(),quote_number,subtotal,tax_total,total,nullif(trim(p_notes),''),p_valid_until);
 for item in select*from quote_lines loop insert into public.quote_items(organization_id,quote_id,product_id,variant_id,product_name,sku,quantity,unit_price,tax_rate,tax_total,line_total)values(p_organization_id,quote_id,item.product_id,item.variant_id,item.product_name,item.sku,item.quantity,item.unit_price,item.tax_rate,round(item.unit_price*item.quantity*item.tax_rate,2),round(item.unit_price*item.quantity*(1+item.tax_rate),2));end loop;
 return quote_id;
end;$$;
revoke all on function public.create_quote(uuid,uuid,uuid,date,text,jsonb)from public;
grant execute on function public.create_quote(uuid,uuid,uuid,date,text,jsonb)to authenticated;
