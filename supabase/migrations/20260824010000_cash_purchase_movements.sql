create or replace function public.record_cash_purchase_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare session_id uuid;
begin
  if new.status <> 'received' or new.payment_terms <> 'cash' or new.received_by is null then return new; end if;
  select id into session_id from public.cash_register_sessions
  where organization_id=new.organization_id and location_id=new.location_id
    and opened_by=new.received_by and status='open'
  order by opened_at desc limit 1;
  if session_id is not null then
    insert into public.cash_register_movements(organization_id,session_id,type,amount,reason,created_by)
    values(new.organization_id,session_id,'withdrawal',new.total,'Compra de contado '||coalesce(new.reference,new.id::text),new.received_by);
  end if;
  return new;
end;$$;

drop trigger if exists purchases_record_cash_movement on public.purchases;
create trigger purchases_record_cash_movement after insert on public.purchases
for each row execute function public.record_cash_purchase_movement();

create or replace function public.record_cash_purchase_return_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare session_id uuid; purchase_reference text;
begin
  if new.resolution <> 'cash' or new.created_by is null then return new; end if;
  select id into session_id from public.cash_register_sessions
  where organization_id=new.organization_id and location_id=new.location_id
    and opened_by=new.created_by and status='open'
  order by opened_at desc limit 1;
  if session_id is not null then
    select reference into purchase_reference from public.purchases where id=new.purchase_id;
    insert into public.cash_register_movements(organization_id,session_id,type,amount,reason,created_by)
    values(new.organization_id,session_id,'deposit',new.total,'Reembolso de proveedor '||coalesce(purchase_reference,new.purchase_id::text),new.created_by);
  end if;
  return new;
end;$$;

drop trigger if exists purchase_returns_record_cash_movement on public.purchase_returns;
create trigger purchase_returns_record_cash_movement after insert on public.purchase_returns
for each row execute function public.record_cash_purchase_return_movement();
