-- Operação Comercial 2.0 — Planos 2.0, zonas e demanda reprimida

alter table public.monthly_plans
  add column if not exists plan_category text not null default 'STANDARD'
    check (plan_category in ('ECONOMIC','STANDARD','GUARANTEED','BUSINESS')),
  add column if not exists vehicle_scope text not null default 'BOTH'
    check (vehicle_scope in ('CAR','MOTORCYCLE','BOTH')),
  add column if not exists guaranteed_space boolean not null default false,
  add column if not exists max_simultaneous_vehicles smallint not null default 1
    check (max_simultaneous_vehicles between 1 and 100),
  add column if not exists access_24h boolean not null default true,
  add column if not exists access_start time,
  add column if not exists access_end time,
  add column if not exists allowed_weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  add column if not exists holidays_allowed boolean not null default true,
  add column if not exists daily_entry_limit smallint check (daily_entry_limit is null or daily_entry_limit>0),
  add column if not exists cancellation_notice_days smallint not null default 0 check (cancellation_notice_days between 0 and 90),
  add column if not exists reserved_capacity smallint not null default 0 check (reserved_capacity between 0 and 10000);

alter table public.monthly_plans drop constraint if exists monthly_plans_simultaneous_limit_check;
alter table public.monthly_plans add constraint monthly_plans_simultaneous_limit_check
  check (max_simultaneous_vehicles<=max_vehicles);
alter table public.monthly_plans drop constraint if exists monthly_plans_access_window_check;
alter table public.monthly_plans add constraint monthly_plans_access_window_check
  check (access_24h or (access_start is not null and access_end is not null));

create or replace function public.create_monthly_plan_v2(
  target_unit uuid,plan_name text,plan_description text,plan_price numeric,
  plan_grace_days smallint,plan_max_vehicles smallint,plan_max_simultaneous smallint,
  plan_category text,plan_vehicle_scope text,plan_guaranteed_space boolean,
  plan_access_24h boolean,plan_access_start time,plan_access_end time,
  plan_holidays_allowed boolean,plan_daily_entry_limit smallint,plan_cancellation_notice_days smallint,
  plan_reserved_capacity smallint
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; new_id uuid;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if char_length(btrim(plan_name))<2 or plan_price<=0 or plan_grace_days<0
    or plan_max_vehicles<1 or plan_max_simultaneous<1 or plan_max_simultaneous>plan_max_vehicles
    or plan_category not in ('ECONOMIC','STANDARD','GUARANTEED','BUSINESS')
    or plan_vehicle_scope not in ('CAR','MOTORCYCLE','BOTH')
    or (not plan_access_24h and (plan_access_start is null or plan_access_end is null))
    or plan_reserved_capacity<0
  then raise exception 'MONTHLY_INVALID_PLAN' using errcode='22023'; end if;

  insert into public.monthly_plans(
    unit_id,name,description,price,due_day_default,grace_days,max_vehicles,
    max_simultaneous_vehicles,plan_category,vehicle_scope,guaranteed_space,
    access_24h,access_start,access_end,holidays_allowed,daily_entry_limit,
    cancellation_notice_days,reserved_capacity
  ) values(
    target_unit,btrim(plan_name),nullif(btrim(plan_description),''),round(plan_price,2),1,
    plan_grace_days,plan_max_vehicles,plan_max_simultaneous,plan_category,plan_vehicle_scope,
    plan_guaranteed_space,plan_access_24h,case when plan_access_24h then null else plan_access_start end,
    case when plan_access_24h then null else plan_access_end end,plan_holidays_allowed,
    plan_daily_entry_limit,plan_cancellation_notice_days,plan_reserved_capacity
  ) returning id into new_id;

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'monthly.plan.v2.created',jsonb_build_object(
    'plan_id',new_id,'category',plan_category,'guaranteed_space',plan_guaranteed_space,
    'max_vehicles',plan_max_vehicles,'max_simultaneous',plan_max_simultaneous
  ));
  return new_id;
end $$;

revoke all on function public.create_monthly_plan_v2(uuid,text,text,numeric,smallint,smallint,smallint,text,text,boolean,boolean,time,time,boolean,smallint,smallint,smallint) from public,anon;
grant execute on function public.create_monthly_plan_v2(uuid,text,text,numeric,smallint,smallint,smallint,text,text,boolean,boolean,time,time,boolean,smallint,smallint,smallint) to authenticated;

create table if not exists public.parking_zones(
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9_-]{1,20}$'),
  capacity integer not null check (capacity>0),
  zone_type text not null default 'FLEX' check (zone_type in ('ROTATION','FLEX','MONTHLY','RESERVED')),
  priority smallint not null default 50 check (priority between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(unit_id,code),unique(unit_id,name)
);

alter table public.parking_sessions add column if not exists zone_id uuid references public.parking_zones(id);
create index if not exists parking_sessions_zone_status_idx on public.parking_sessions(zone_id,status,entered_at desc);
create index if not exists parking_zones_unit_active_idx on public.parking_zones(unit_id,is_active,priority);

create table if not exists public.parking_demand_events(
  id bigint generated always as identity primary key,
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  zone_id uuid references public.parking_zones(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  reason text not null check (reason in ('FULL','NO_ACCEPTABLE_PLAN','TURNED_AWAY','OTHER')),
  vehicle_type public.vehicle_type,
  source text not null default 'OPERATOR' check (source in ('OPERATOR','SYSTEM','CEO')),
  notes text check (notes is null or char_length(notes)<=500),
  recorded_by uuid references auth.users(id)
);
create index if not exists parking_demand_events_unit_time_idx on public.parking_demand_events(unit_id,occurred_at desc,reason);

alter table public.parking_zones enable row level security;
alter table public.parking_demand_events enable row level security;

drop policy if exists parking_zones_read_staff on public.parking_zones;
create policy parking_zones_read_staff on public.parking_zones for select to authenticated using (
  private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
);
drop policy if exists parking_demand_events_read_management on public.parking_demand_events;
create policy parking_demand_events_read_management on public.parking_demand_events for select to authenticated using (
  private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[])
);

revoke all on public.parking_zones,public.parking_demand_events from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.parking_zones,public.parking_demand_events from authenticated;
grant select on public.parking_zones,public.parking_demand_events to authenticated;
grant all on public.parking_zones,public.parking_demand_events to service_role;

create or replace function public.upsert_parking_zone(
  target_zone uuid,target_unit uuid,p_zone_name text,p_zone_code text,p_zone_capacity integer,
  p_zone_type text,p_zone_priority smallint,p_zone_active boolean
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; result_id uuid; allocated integer; unit_capacity integer;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if p_zone_capacity<=0 or p_zone_type not in ('ROTATION','FLEX','MONTHLY','RESERVED')
    or p_zone_priority not between 1 and 100 or char_length(btrim(p_zone_name))<2
    or upper(btrim(p_zone_code))!~'^[A-Z0-9_-]{1,20}$'
  then raise exception 'INVALID_ZONE' using errcode='22023'; end if;

  select capacity into unit_capacity from public.parking_units where id=target_unit and is_active for update;
  if unit_capacity is null then raise exception 'UNIT_NOT_FOUND' using errcode='P0002'; end if;
  select coalesce(sum(capacity),0) into allocated from public.parking_zones
    where unit_id=target_unit and is_active and (target_zone is null or id<>target_zone);
  if p_zone_active and allocated+p_zone_capacity>unit_capacity then
    raise exception 'ZONE_CAPACITY_EXCEEDS_UNIT' using errcode='22023'; end if;

  if target_zone is null then
    insert into public.parking_zones(unit_id,name,code,capacity,zone_type,priority,is_active)
    values(target_unit,btrim(p_zone_name),upper(btrim(p_zone_code)),p_zone_capacity,p_zone_type,p_zone_priority,p_zone_active)
    returning id into result_id;
  else
    update public.parking_zones set
      name=btrim(p_zone_name),code=upper(btrim(p_zone_code)),capacity=p_zone_capacity,
      zone_type=p_zone_type,priority=p_zone_priority,is_active=p_zone_active,updated_at=clock_timestamp()
    where id=target_zone and unit_id=target_unit returning id into result_id;
    if result_id is null then raise exception 'ZONE_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'capacity.zone.upserted',jsonb_build_object(
    'zone_id',result_id,'capacity',p_zone_capacity,'type',p_zone_type,'active',p_zone_active
  ));
  return result_id;
end $$;

create or replace function public.record_parking_demand_loss(
  target_unit uuid,target_reason text,target_vehicle_type public.vehicle_type,target_notes text default null
) returns bigint language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); new_id bigint; event_source text;
begin
  if actor is null or not private.has_unit_role(target_unit,array['owner','manager','operator']::public.app_role[]) then
    raise exception 'DEMAND_EVENT_FORBIDDEN' using errcode='42501'; end if;
  if target_reason not in ('FULL','NO_ACCEPTABLE_PLAN','TURNED_AWAY','OTHER') then
    raise exception 'INVALID_DEMAND_REASON' using errcode='22023'; end if;
  event_source:=case when private.has_unit_role(target_unit,array['operator']::public.app_role[]) then 'OPERATOR' else 'CEO' end;
  insert into public.parking_demand_events(unit_id,reason,vehicle_type,source,notes,recorded_by)
  values(target_unit,target_reason,target_vehicle_type,event_source,nullif(btrim(target_notes),''),actor)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.upsert_parking_zone(uuid,uuid,text,text,integer,text,smallint,boolean) from public,anon;
revoke all on function public.record_parking_demand_loss(uuid,text,public.vehicle_type,text) from public,anon;
grant execute on function public.upsert_parking_zone(uuid,uuid,text,text,integer,text,smallint,boolean) to authenticated;
grant execute on function public.record_parking_demand_loss(uuid,text,public.vehicle_type,text) to authenticated;
