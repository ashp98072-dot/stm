create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.membership_role not null default 'viewer',
  invited_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(trim(email))),
  check (role <> 'owner')
);

create unique index organization_invitations_pending_email_idx
on public.organization_invitations (organization_id, email)
where accepted_at is null;

alter table public.organization_invitations enable row level security;

create policy "admins read invitations" on public.organization_invitations for select to authenticated
using (
  public.has_organization_role(organization_id, array['owner','admin']::public.membership_role[])
  or email = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "members read colleague profiles" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members colleague
    join public.organization_members current_member
      on current_member.organization_id = colleague.organization_id
    where colleague.user_id = profiles.id
      and colleague.active
      and current_member.user_id = auth.uid()
      and current_member.active
  )
);

create or replace function public.invite_organization_member(
  target_organization_id uuid,
  target_email text,
  target_role public.membership_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(target_email));
  invitation_id uuid;
  caller_role public.membership_role;
begin
  select role into caller_role
  from public.organization_members
  where organization_id = target_organization_id and user_id = auth.uid() and active;

  if caller_role not in ('owner', 'admin') then raise exception 'insufficient permissions'; end if;
  if target_role = 'owner' or (target_role = 'admin' and caller_role <> 'owner') then raise exception 'role not allowed'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email'; end if;

  insert into public.organization_invitations (organization_id, email, role, invited_by)
  values (target_organization_id, normalized_email, target_role, auth.uid())
  on conflict (organization_id, email) where accepted_at is null
  do update set role = excluded.role, invited_by = auth.uid(), created_at = now()
  returning id into invitation_id;

  return invitation_id;
end;
$$;

create or replace function public.accept_organization_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into invitation
  from public.organization_invitations
  where id = invitation_id and accepted_at is null
  for update;

  if invitation.id is null or invitation.email <> current_email then raise exception 'invitation unavailable'; end if;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (invitation.organization_id, auth.uid(), invitation.role, true)
  on conflict (organization_id, user_id)
  do update set role = excluded.role, active = true;

  update public.organization_invitations set accepted_at = now() where id = invitation.id;
  return invitation.organization_id;
end;
$$;

create or replace function public.manage_organization_member(
  target_organization_id uuid,
  target_user_id uuid,
  target_role public.membership_role,
  target_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role public.membership_role;
  existing_role public.membership_role;
begin
  select role into caller_role from public.organization_members
  where organization_id = target_organization_id and user_id = auth.uid() and active;
  select role into existing_role from public.organization_members
  where organization_id = target_organization_id and user_id = target_user_id;

  if caller_role not in ('owner', 'admin') then raise exception 'insufficient permissions'; end if;
  if existing_role is null or existing_role = 'owner' or target_role = 'owner' then raise exception 'protected membership'; end if;
  if caller_role = 'admin' and (existing_role = 'admin' or target_role = 'admin') then raise exception 'owner permission required'; end if;
  if target_user_id = auth.uid() and not target_active then raise exception 'cannot deactivate yourself'; end if;

  update public.organization_members
  set role = target_role, active = target_active
  where organization_id = target_organization_id and user_id = target_user_id;
end;
$$;

revoke all on function public.invite_organization_member(uuid, text, public.membership_role) from public;
revoke all on function public.accept_organization_invitation(uuid) from public;
revoke all on function public.manage_organization_member(uuid, uuid, public.membership_role, boolean) from public;
grant execute on function public.invite_organization_member(uuid, text, public.membership_role) to authenticated;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
grant execute on function public.manage_organization_member(uuid, uuid, public.membership_role, boolean) to authenticated;
