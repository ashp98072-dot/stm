create or replace function public.complete_quoted_sale(
  p_organization_id uuid,
  p_location_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_amount_received numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_quote_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_quote public.quotes%rowtype;
  sale_id uuid;
begin
  select * into target_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if target_quote.id is null or target_quote.status <> 'draft' then
    raise exception 'quote unavailable';
  end if;
  if target_quote.organization_id <> p_organization_id or target_quote.location_id <> p_location_id then
    raise exception 'quote scope mismatch';
  end if;
  if target_quote.customer_id is distinct from p_customer_id then
    raise exception 'quote customer mismatch';
  end if;

  sale_id := public.complete_sale(
    p_organization_id,
    p_location_id,
    p_customer_id,
    p_items,
    p_payment_method,
    p_amount_received,
    p_discount_type,
    p_discount_value
  );

  perform public.convert_quote(p_quote_id, sale_id);
  return sale_id;
end;
$$;

revoke all on function public.complete_quoted_sale(uuid, uuid, uuid, jsonb, text, numeric, text, numeric, uuid) from public;
grant execute on function public.complete_quoted_sale(uuid, uuid, uuid, jsonb, text, numeric, text, numeric, uuid) to authenticated;
