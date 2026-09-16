-- Hermes Social Connections - Star Carvalhos
-- Phase 5E
-- Stores connection metadata only.
-- OAuth tokens, refresh tokens, app secrets and n8n vault identifiers
-- must never be stored in this table.

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null
    references public.parking_units(id)
    on delete cascade,

  platform text not null
    check (platform in ('facebook','instagram','tiktok')),

  external_account_id text not null
    check (char_length(trim(external_account_id)) between 1 and 255),

  external_parent_id text,

  username text,
  display_name text,

  status text not null default 'connected'
    check (
      status in (
        'connected',
        'reconnect_required',
        'disconnected',
        'error'
      )
    ),

  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  disconnected_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint social_connections_unit_platform_account_unique
    unique (unit_id, platform, external_account_id),

  constraint social_connections_id_unit_unique
    unique (id, unit_id)
);

create index if not exists social_connections_unit_platform_status_idx
  on public.social_connections (unit_id, platform, status);

create index if not exists social_connections_external_account_idx
  on public.social_connections (platform, external_account_id);

alter table public.social_connections enable row level security;

revoke all on table public.social_connections
from public, anon, authenticated;

grant all on table public.social_connections
to service_role;

grant select on table public.social_connections
to authenticated;

drop policy if exists social_connections_read_management
on public.social_connections;

create policy social_connections_read_management
on public.social_connections
for select
to authenticated
using (
  private.has_unit_role(
    unit_id,
    array['owner','manager','auditor']::public.app_role[]
  )
);
