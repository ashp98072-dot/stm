create or replace function public.complete_priced_sale(
  p_organization_id uuid,p_location_id uuid,p_customer_id uuid,p_items jsonb,
  p_payment_method text,p_amount_received numeric,p_discount_type text,p_discount_value numeric
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale_id uuid;v_subtotal numeric(14,2);v_discount_requested numeric(14,2);v_discount_total numeric(14,2);v_tax_total numeric(14,2);v_total numeric(14,2);v_line record;v_unit_price numeric(14,2);v_base numeric(14,2);v_line_discount numeric(14,2);v_line_tax numeric(14,2);v_line_total numeric(14,2);
begin
  if p_payment_method not in('cash','card','transfer','store_credit','other')then raise exception 'invalid payment method';end if;
  if p_discount_type not in('none','percent','fixed')or coalesce(p_discount_value,0)<0 or(p_discount_type='percent'and p_discount_value>100)then raise exception 'invalid discount';end if;
  v_sale_id:=public.complete_sale(p_organization_id,p_location_id,p_customer_id,p_items,'other',null,'none',0);
  delete from public.payments where sale_id=v_sale_id;
  select coalesce(sum(public.product_rule_price(p_organization_id,item.product_id,item.quantity,now())*item.quantity),0)
  into v_subtotal from public.sale_items item where item.sale_id=v_sale_id;
  v_discount_requested:=case p_discount_type when'percent'then round(v_subtotal*p_discount_value/100,2)when'fixed'then round(p_discount_value,2)else 0 end;
  if v_discount_requested>=v_subtotal then raise exception 'discount exceeds subtotal';end if;
  v_discount_total:=0;v_tax_total:=0;v_total:=0;
  for v_line in select item.id,item.product_id,item.quantity,product.tax_rate from public.sale_items item join public.products product on product.id=item.product_id where item.sale_id=v_sale_id order by item.id loop
    v_unit_price:=public.product_rule_price(p_organization_id,v_line.product_id,v_line.quantity,now());v_base:=round(v_unit_price*v_line.quantity,2);
    v_line_discount:=case when v_subtotal=0 then 0 else round(v_base*v_discount_requested/v_subtotal,2)end;
    v_line_tax:=round((v_base-v_line_discount)*v_line.tax_rate,2);v_line_total:=v_base-v_line_discount+v_line_tax;
    update public.sale_items set unit_price=v_unit_price,discount_total=v_line_discount,tax_total=v_line_tax,line_total=v_line_total where id=v_line.id;
    v_discount_total:=v_discount_total+v_line_discount;v_tax_total:=v_tax_total+v_line_tax;v_total:=v_total+v_line_total;
  end loop;
  if v_total<=0 then raise exception 'sale total must be positive';end if;
  if p_payment_method='cash'and p_amount_received is not null and p_amount_received<v_total then raise exception 'insufficient payment';end if;
  update public.sales set subtotal=v_subtotal,discount_total=v_discount_total,tax_total=v_tax_total,total=v_total,updated_at=now()where id=v_sale_id;
  insert into public.payments(organization_id,sale_id,method,amount,reference)values(p_organization_id,v_sale_id,p_payment_method::public.payment_method,v_total,case when p_payment_method='cash'and p_amount_received is not null then'Recibido: '||p_amount_received::text||'; Cambio: '||(p_amount_received-v_total)::text else null end);
  return v_sale_id;
end;$$;

create or replace function public.complete_quoted_sale(
  p_organization_id uuid,p_location_id uuid,p_customer_id uuid,p_items jsonb,p_payment_method text,
  p_amount_received numeric,p_discount_type text,p_discount_value numeric,p_quote_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_quote public.quotes%rowtype;sale_id uuid;
begin
  select*into target_quote from public.quotes where id=p_quote_id for update;
  if target_quote.id is null or target_quote.status<>'draft'then raise exception 'quote unavailable';end if;
  if target_quote.organization_id<>p_organization_id or target_quote.location_id<>p_location_id then raise exception 'quote scope mismatch';end if;
  if target_quote.customer_id is distinct from p_customer_id then raise exception 'quote customer mismatch';end if;
  sale_id:=public.complete_priced_sale(p_organization_id,p_location_id,p_customer_id,p_items,p_payment_method,p_amount_received,p_discount_type,p_discount_value);
  perform public.convert_quote(p_quote_id,sale_id);return sale_id;
end;$$;

revoke all on function public.complete_priced_sale(uuid,uuid,uuid,jsonb,text,numeric,text,numeric)from public;
revoke all on function public.complete_quoted_sale(uuid,uuid,uuid,jsonb,text,numeric,text,numeric,uuid)from public;
grant execute on function public.complete_priced_sale(uuid,uuid,uuid,jsonb,text,numeric,text,numeric)to authenticated;
grant execute on function public.complete_quoted_sale(uuid,uuid,uuid,jsonb,text,numeric,text,numeric,uuid)to authenticated;
