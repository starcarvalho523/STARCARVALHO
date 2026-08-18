-- Keep employee accounts separate from individual unit assignments.
-- Existing assignments remain active; revocation is soft and preserves history.
alter table public.user_unit_roles
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id) on delete set null;

create index if not exists user_unit_roles_active_user_unit_idx
  on public.user_unit_roles (user_id, unit_id)
  where is_active;

create or replace function private.has_unit_role(target_unit_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_unit_roles uur
    join public.profiles p on p.id = uur.user_id and p.is_active
    where uur.user_id = (select auth.uid())
      and uur.unit_id = target_unit_id
      and uur.role = any(allowed_roles)
      and uur.is_active
  );
$$;

revoke all on function private.has_unit_role(uuid, public.app_role[]) from public;
grant execute on function private.has_unit_role(uuid, public.app_role[]) to authenticated;
