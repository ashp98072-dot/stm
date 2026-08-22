alter table public.suppliers add column credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0);
create or replace function public.enforce_supplier_credit_limit()
returns trigger language plpgsql set search_path = '' as $$
declare allowed_limit numeric(14,2); current_balance numeric(14,2);
begin
  if new.type::text <> 'charge' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.supplier_id::text, 1));
  select credit_limit into allowed_limit from public.suppliers where id=new.supplier_id;
  if allowed_limit is null then return new; end if;
  select coalesce(sum(case when type='charge' then amount else -amount end),0) into current_balance from public.supplier_account_movements where supplier_id=new.supplier_id;
  if current_balance+new.amount>allowed_limit then raise exception 'supplier credit limit exceeded'; end if;
  return new;
end;
$$;
create trigger supplier_credit_limit_guard before insert on public.supplier_account_movements for each row execute function public.enforce_supplier_credit_limit();
