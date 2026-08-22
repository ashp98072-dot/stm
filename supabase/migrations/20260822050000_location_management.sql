alter table public.profiles
add column selected_location_id uuid references public.locations(id) on delete set null;

create or replace function public.select_location(target_location_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.locations location
    join public.organization_members member on member.organization_id = location.organization_id
    where location.id = target_location_id and location.active
      and member.user_id = auth.uid() and member.active
  ) then raise exception 'location unavailable'; end if;
  update public.profiles set selected_location_id = target_location_id where id = auth.uid();
end;
$$;

create or replace function public.create_location(
  target_organization_id uuid,
  location_name text,
  location_address text default null,
  location_phone text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_location_id uuid;
begin
  if not public.has_organization_role(target_organization_id, array['owner','admin','manager']::public.membership_role[])
    then raise exception 'insufficient permissions'; end if;
  if length(trim(location_name)) < 2 then raise exception 'location name is too short'; end if;

  insert into public.locations (organization_id, name, address, phone)
  values (target_organization_id, trim(location_name), nullif(trim(location_address), ''), nullif(trim(location_phone), ''))
  returning id into new_location_id;

  insert into public.inventory_levels (organization_id, location_id, product_id, quantity, reorder_point)
  select target_organization_id, new_location_id, id, 0, 0
  from public.products where organization_id = target_organization_id and active;
  return new_location_id;
end;
$$;

create or replace function public.update_location(
  target_location_id uuid,
  location_name text,
  location_address text,
  location_phone text,
  target_active boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_organization_id uuid; active_count integer;
begin
  select organization_id into target_organization_id from public.locations where id = target_location_id;
  if not public.has_organization_role(target_organization_id, array['owner','admin','manager']::public.membership_role[])
    then raise exception 'insufficient permissions'; end if;
  if length(trim(location_name)) < 2 then raise exception 'location name is too short'; end if;
  if not target_active then
    select count(*) into active_count from public.locations where organization_id = target_organization_id and active and id <> target_location_id;
    if active_count = 0 then raise exception 'organization requires an active location'; end if;
  end if;

  update public.locations set name = trim(location_name), address = nullif(trim(location_address), ''),
    phone = nullif(trim(location_phone), ''), active = target_active where id = target_location_id;
  if not target_active then
    update public.profiles set selected_location_id = null where selected_location_id = target_location_id;
  end if;
end;
$$;

revoke all on function public.select_location(uuid) from public;
revoke all on function public.create_location(uuid, text, text, text) from public;
revoke all on function public.update_location(uuid, text, text, text, boolean) from public;
grant execute on function public.select_location(uuid) to authenticated;
grant execute on function public.create_location(uuid, text, text, text) to authenticated;
grant execute on function public.update_location(uuid, text, text, text, boolean) to authenticated;
