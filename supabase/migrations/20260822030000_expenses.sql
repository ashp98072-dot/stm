create type public.expense_status as enum ('posted', 'voided');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  category_id uuid references public.expense_categories(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  status public.expense_status not null default 'posted',
  description text not null,
  reference text,
  amount numeric(14,2) not null check (amount > 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total numeric(14,2) generated always as (amount + tax_amount) stored,
  payment_method public.payment_method not null default 'cash',
  incurred_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_org_incurred_idx on public.expenses (organization_id, incurred_at desc);
create trigger expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy "expense roles read categories" on public.expense_categories for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','viewer']::public.membership_role[]));
create policy "expense roles manage categories" on public.expense_categories for all to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]));
create policy "expense roles read expenses" on public.expenses for select to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager','viewer']::public.membership_role[]));
create policy "expense roles add expenses" on public.expenses for insert to authenticated
with check (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]));
create policy "expense roles update expenses" on public.expenses for update to authenticated
using (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]))
with check (public.has_organization_role(organization_id, array['owner','admin','manager']::public.membership_role[]));
