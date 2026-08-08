-- Customers are intentionally separate from employee authorization.
create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  role public.app_role not null check (role <> 'customer'::public.app_role),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null references public.profiles(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (email, unit_id, role)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  unit_id uuid references public.parking_units(id) on delete set null,
  action text not null check (char_length(action) between 3 and 80),
  target_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_unit_roles
  add constraint user_unit_roles_employee_only check (role <> 'customer'::public.app_role);

alter table public.customer_profiles enable row level security;
alter table public.employee_invitations enable row level security;
alter table public.audit_logs enable row level security;

create policy "customers_read_self" on public.customer_profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy "customers_create_self" on public.customer_profiles
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "customers_update_self" on public.customer_profiles
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "profiles_read_shared_unit" on public.profiles
for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.user_unit_roles target
    where target.user_id = profiles.id
      and private.has_unit_role(target.unit_id, array['owner','manager']::public.app_role[])
  )
);
drop policy if exists "profiles_read_self" on public.profiles;

create policy "invitations_read_admin" on public.employee_invitations
for select to authenticated using (
  private.has_unit_role(unit_id, array['owner','manager']::public.app_role[])
);
create policy "audit_read_admin" on public.audit_logs
for select to authenticated using (
  private.has_unit_role(unit_id, array['owner','manager','auditor']::public.app_role[])
);

grant select, insert, update on public.customer_profiles to authenticated;
grant select on public.employee_invitations, public.audit_logs to authenticated;

create index employee_invitations_unit_idx on public.employee_invitations (unit_id, invited_at desc);
create index audit_logs_unit_created_idx on public.audit_logs (unit_id, created_at desc);
