revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create type public.app_role as enum ('owner', 'manager', 'operator', 'finance', 'auditor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.parking_units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'America/Bahia',
  capacity integer not null check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_unit_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, unit_id, role)
);
create index user_unit_roles_unit_user_idx on public.user_unit_roles (unit_id, user_id);
alter table public.profiles enable row level security;
alter table public.parking_units enable row level security;
alter table public.user_unit_roles enable row level security;

create or replace function private.has_unit_role(target_unit_id uuid, allowed_roles public.app_role[])
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.user_unit_roles uur
    join public.profiles p on p.id = uur.user_id and p.is_active
    where uur.user_id = (select auth.uid()) and uur.unit_id = target_unit_id and uur.role = any(allowed_roles)
  );
$$;
revoke all on function private.has_unit_role(uuid, public.app_role[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_unit_role(uuid, public.app_role[]) to authenticated;

create policy "profiles_read_self" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "units_read_members" on public.parking_units for select to authenticated using (private.has_unit_role(id, array['owner','manager','operator','finance','auditor']::public.app_role[]));
create policy "unit_roles_read_self_or_admin" on public.user_unit_roles for select to authenticated using (user_id = (select auth.uid()) or private.has_unit_role(unit_id, array['owner','manager']::public.app_role[]));
grant select on public.profiles, public.parking_units, public.user_unit_roles to authenticated;

