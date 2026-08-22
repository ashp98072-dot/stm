create or replace function public.update_document_due_date(
  p_document_type text,
  p_movement_id uuid,
  p_due_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
begin
  if p_due_date is null then raise exception 'due date required'; end if;

  if p_document_type = 'customer' then
    select movement.organization_id into organization_id
    from public.customer_account_movements movement
    where movement.id = p_movement_id and movement.type = 'charge';

    if organization_id is null or not public.has_organization_role(
      organization_id,
      array['owner','admin','manager']::public.membership_role[]
    ) then raise exception 'movement unavailable'; end if;

    update public.customer_account_movements
    set due_date = p_due_date where id = p_movement_id;
  elsif p_document_type = 'supplier' then
    select movement.organization_id into organization_id
    from public.supplier_account_movements movement
    where movement.id = p_movement_id and movement.type = 'charge';

    if organization_id is null or not public.has_organization_role(
      organization_id,
      array['owner','admin','manager']::public.membership_role[]
    ) then raise exception 'movement unavailable'; end if;

    update public.supplier_account_movements
    set due_date = p_due_date where id = p_movement_id;
  else
    raise exception 'invalid document type';
  end if;
end;
$$;

revoke all on function public.update_document_due_date(text, uuid, date) from public;
grant execute on function public.update_document_due_date(text, uuid, date) to authenticated;
