create or replace function public.record_cash_expense_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare session_id uuid; actor_id uuid; movement_type public.cash_movement_type; movement_reason text;
begin
  if tg_op='INSERT' then
    if new.status<>'posted' or new.payment_method<>'cash' or new.created_by is null then return new; end if;
    actor_id:=new.created_by;movement_type:='withdrawal';movement_reason:='Gasto '||new.id::text||': '||new.description;
  elsif old.status='posted' and new.status='voided' and new.payment_method='cash' and new.voided_by is not null then
    movement_reason:='Gasto '||new.id::text||': '||new.description;
    if not exists(select 1 from public.cash_register_movements where organization_id=new.organization_id and type='withdrawal' and reason=movement_reason) then return new;end if;
    actor_id:=new.voided_by;movement_type:='deposit';movement_reason:='Anulación de gasto '||new.id::text||': '||new.description;
  else return new;
  end if;
  select id into session_id from public.cash_register_sessions where organization_id=new.organization_id and location_id=new.location_id and opened_by=actor_id and status='open' order by opened_at desc limit 1;
  if session_id is not null then
    insert into public.cash_register_movements(organization_id,session_id,type,amount,reason,created_by) values(new.organization_id,session_id,movement_type,new.total,movement_reason,actor_id);
  end if;
  return new;
end;$$;

drop trigger if exists expenses_record_cash_movement on public.expenses;
create trigger expenses_record_cash_movement after insert or update of status on public.expenses for each row execute function public.record_cash_expense_movement();

create or replace function public.reverse_voided_cash_purchase_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare session_id uuid; actor_id uuid; original_reason text;
begin
  actor_id:=auth.uid();original_reason:='Compra de contado '||coalesce(new.reference,new.id::text);
  if old.status<>'received' or new.status<>'voided' or new.payment_terms<>'cash' or actor_id is null then return new;end if;
  if not exists(select 1 from public.cash_register_movements where organization_id=new.organization_id and type='withdrawal' and reason=original_reason) then return new;end if;
  select id into session_id from public.cash_register_sessions where organization_id=new.organization_id and location_id=new.location_id and opened_by=actor_id and status='open' order by opened_at desc limit 1;
  if session_id is not null then
    insert into public.cash_register_movements(organization_id,session_id,type,amount,reason,created_by) values(new.organization_id,session_id,'deposit',new.total,'Anulación de compra '||coalesce(new.reference,new.id::text),actor_id);
  end if;
  return new;
end;$$;

drop trigger if exists purchases_reverse_cash_movement on public.purchases;
create trigger purchases_reverse_cash_movement after update of status on public.purchases for each row execute function public.reverse_voided_cash_purchase_movement();
