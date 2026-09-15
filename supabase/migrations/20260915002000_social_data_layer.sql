-- Hermes Social Data Layer - Star Carvalhos
-- Phase 5D
-- Scope: content, campaigns, scheduling metadata and publication audit.
-- OAuth/social credentials are intentionally out of scope (Phase 5E).

create table if not exists public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 120),
  objective text not null default 'awareness'
    check (objective in ('awareness','engagement','conversion','retention','education')),
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_campaigns_period_check
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint social_campaigns_id_unit_unique
    unique (id, unit_id)
);
create table if not exists public.social_content_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  campaign_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 160),
  caption text not null default '',
  content_type text not null
    check (content_type in ('text','image','video','carousel','story','reel')),
  media_url text,
  platforms text[] not null default '{}'::text[],
  status text not null default 'draft'
    check (status in ('draft','approved','rejected','scheduled','publishing','published','partially_published','failed','cancelled')),
  scheduled_for timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_content_id_unit_unique
    unique (id, unit_id),
  constraint social_content_platforms_check
    check (
      cardinality(platforms) = 0
      or platforms <@ array['facebook','instagram','tiktok']::text[]
    ),
  constraint social_content_campaign_unit_fk
    foreign key (campaign_id, unit_id)
    references public.social_campaigns(id, unit_id)
    on delete restrict
);
create table if not exists public.social_publication_logs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  content_item_id uuid not null,
  platform text not null
    check (platform in ('facebook','instagram','tiktok')),
  status text not null
    check (status in ('pending','published','failed','inbox_ready')),
  attempt integer not null default 1 check (attempt >= 1),
  external_post_id text,
  external_url text,
  error_code text,
  error_message text,
  response_sanitized jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint social_publication_logs_content_unit_fk
    foreign key (content_item_id, unit_id)
    references public.social_content_items(id, unit_id)
    on delete cascade
);
create index if not exists social_campaigns_unit_status_idx
  on public.social_campaigns (unit_id, status, updated_at desc);
create index if not exists social_content_items_unit_status_schedule_idx
  on public.social_content_items (unit_id, status, scheduled_for);
create index if not exists social_content_items_campaign_idx
  on public.social_content_items (campaign_id, created_at desc);
create index if not exists social_publication_logs_content_platform_idx
  on public.social_publication_logs (content_item_id, platform, created_at desc);
create index if not exists social_publication_logs_unit_created_idx
  on public.social_publication_logs (unit_id, created_at desc);
alter table public.social_campaigns enable row level security;
alter table public.social_content_items enable row level security;
alter table public.social_publication_logs enable row level security;
revoke all on table
  public.social_campaigns,
  public.social_content_items,
  public.social_publication_logs
from public, anon, authenticated;
grant all on table
  public.social_campaigns,
  public.social_content_items,
  public.social_publication_logs
to service_role;
grant select on table
  public.social_campaigns,
  public.social_content_items
to authenticated;
create policy social_campaigns_read_management
on public.social_campaigns
for select to authenticated
using (
  private.has_unit_role(
    unit_id,
    array['owner','manager','auditor']::public.app_role[]
  )
);
create policy social_content_items_read_management
on public.social_content_items
for select to authenticated
using (
  private.has_unit_role(
    unit_id,
    array['owner','manager','auditor']::public.app_role[]
  )
);
