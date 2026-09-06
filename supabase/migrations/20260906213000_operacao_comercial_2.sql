-- Star Carvalhos — Operação Comercial 2.0
-- Evolução aditiva e compatível: corrige o hardening de has_unit_role,
-- expande tarifas/planos e cria capacidade por zonas, demanda reprimida e B2B.

-- 0. Corrige o único acesso privado que as policies RLS precisam executar
-- como authenticated. Todas as demais funções privadas continuam sem EXECUTE.
grant usage on schema private to authenticated;
grant execute on function private.has_unit_role(uuid, public.app_role[]) to authenticated;

-- 1. Tarifa 2.0 ------------------------------------------------------------
alter table public.tariff_rules
  add column if not exists intermediate_cap_amount numeric(12,2)
    check (intermediate_cap_amount is null or intermediate_cap_amount > 0),
  add column if not exists intermediate_after_minutes integer
    check (intermediate_after_minutes is null or intermediate_after_minutes > 0),
  add column if not exists exit_grace_minutes integer not null default 10
    check (exit_grace_minutes between 0 and 120),
  add column if not exists daily_cycle_minutes integer not null default 1440
    check (daily_cycle_minutes between 60 and 10080);

alter table public.tariff_rules
  drop constraint if exists tariff_rules_intermediate_pair_check;
alter table public.tariff_rules
  add constraint tariff_rules_intermediate_pair_check check (
    (intermediate_cap_amount is null and intermediate_after_minutes is null)
    or
    (intermediate_cap_amount is not null and intermediate_after_minutes is not null)
  );

create or replace function private.charge_amount(snapshot jsonb, entered timestamptz, reference_time timestamptz)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  mins integer := greatest(0, ceil(extract(epoch from (reference_time - entered)) / 60)::integer);
  grace_mins integer := coalesce(nullif(snapshot->>'grace_minutes','')::integer,0);
  first_hour numeric := coalesce(nullif(snapshot->>'first_hour_amount','')::numeric,0);
  additional numeric := coalesce(nullif(snapshot->>'additional_amount','')::numeric,0);
  fraction integer := greatest(1,coalesce(nullif(snapshot->>'additional_fraction_minutes','')::integer,60));
  daily_cap numeric := nullif(snapshot->>'daily_cap_amount','')::numeric;
  daily_after integer := nullif(snapshot->>'daily_after_minutes','')::integer;
  intermediate_cap numeric := nullif(snapshot->>'intermediate_cap_amount','')::numeric;
  intermediate_after integer := nullif(snapshot->>'intermediate_after_minutes','')::integer;
  cycle_mins integer := greatest(60,coalesce(nullif(snapshot->>'daily_cycle_minutes','')::integer,1440));
  completed_cycles integer := 0;
  remaining integer;
  cycle_total numeric := 0;
  total numeric := 0;
begin
  if mins <= grace_mins then return 0; end if;

  -- Ciclos completos passam a somar diárias, evitando que 48h custem uma só diária.
  if daily_cap is not null and mins >= cycle_mins then
    completed_cycles := floor(mins::numeric / cycle_mins)::integer;
    remaining := mod(mins,cycle_mins);
    total := completed_cycles * daily_cap;
    if remaining = 0 then return round(total,2); end if;
  else
    remaining := mins;
  end if;

  if remaining <= grace_mins then
    cycle_total := 0;
  else
    cycle_total := first_hour;
    if remaining > 60 then
      cycle_total := cycle_total + ceil((remaining - 60)::numeric / fraction) * additional;
    end if;

    if intermediate_cap is not null and intermediate_after is not null and remaining >= intermediate_after then
      cycle_total := least(cycle_total, intermediate_cap);
    end if;

    if daily_cap is not null then
      if daily_after is not null and remaining >= daily_after then
        cycle_total := daily_cap;
      else
        cycle_total := least(cycle_total,daily_cap);
      end if;
    end if;
  end if;

  return round(total + cycle_total,2);
end;
$$;
revoke all on function private.charge_amount(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function private.complete_parking_tariff_snapshot()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare rule public.tariff_rules;
begin
  if new.tariff_rule_id is null then return new; end if;
  select * into rule from public.tariff_rules where id=new.tariff_rule_id;
  if not found then raise exception 'TARIFF_RULE_NOT_FOUND' using errcode='P0002'; end if;
  new.tariff_snapshot := coalesce(new.tariff_snapshot,'{}'::jsonb) || jsonb_build_object(
    'version_number',rule.version_number,
    'daily_after_minutes',rule.daily_after_minutes,
    'intermediate_cap_amount',rule.intermediate_cap_amount,
    'intermediate_after_minutes',rule.intermediate_after_minutes,
    'exit_grace_minutes',rule.exit_grace_minutes,
    'daily_cycle_minutes',rule.daily_cycle_minutes
  );
  return new;
end;
$$;
revoke all on function private.complete_parking_tariff_snapshot() from public,anon,authenticated;

update public.parking_sessions s
set tariff_snapshot=coalesce(s.tariff_snapshot,'{}'::jsonb) || jsonb_build_object(
  'intermediate_cap_amount',t.intermediate_cap_amount,
  'intermediate_after_minutes',t.intermediate_after_minutes,
  'exit_grace_minutes',t.exit_grace_minutes,
  'daily_cycle_minutes',t.daily_cycle_minutes
)
from public.tariff_rules t
where t.id=s.tariff_rule_id
  and not (coalesce(s.tariff_snapshot,'{}'::jsonb) ? 'daily_cycle_minutes');

create or replace function public.preview_tariff_charges_v2(
  target_unit uuid, first_hour numeric, additional numeric, fraction_minutes integer,
  tolerance_minutes integer, daily_amount numeric, daily_hours integer,
  intermediate_amount numeric, intermediate_hours numeric,
  exit_grace integer, daily_cycle_hours integer, sample_minutes integer[]
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,private,auth
as $$
declare snapshot jsonb; result jsonb;
begin
  perform private.require_owner(target_unit);
  if first_hour<=0 or additional<=0 or fraction_minutes<=0 or tolerance_minutes<0
    or daily_amount<=0 or daily_hours<=0 or exit_grace<0 or daily_cycle_hours<=0
    or ((intermediate_amount is null) <> (intermediate_hours is null))
    or (intermediate_amount is not null and (intermediate_amount<=0 or intermediate_hours<=0))
    or daily_hours*60>daily_cycle_hours*60
    or (intermediate_hours is not null and intermediate_hours*60>=daily_hours*60)
  then raise exception 'INVALID_TARIFF' using errcode='22023'; end if;

  snapshot:=jsonb_build_object(
    'first_hour_amount',first_hour,'additional_amount',additional,
    'additional_fraction_minutes',fraction_minutes,'grace_minutes',tolerance_minutes,
    'daily_cap_amount',daily_amount,'daily_after_minutes',daily_hours*60,
    'intermediate_cap_amount',intermediate_amount,
    'intermediate_after_minutes',case when intermediate_hours is null then null else round(intermediate_hours*60)::integer end,
    'exit_grace_minutes',exit_grace,'daily_cycle_minutes',daily_cycle_hours*60
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'minutes',sample,'total',private.charge_amount(snapshot,'2000-01-01 00:00:00+00'::timestamptz,
      '2000-01-01 00:00:00+00'::timestamptz+(sample*interval '1 minute'))
  ) order by sample),'[]'::jsonb) into result from unnest(sample_minutes) samples(sample);
  return result;
end;
$$;

create or replace function public.create_tariff_version_v2(
  target_unit uuid,target_vehicle_type public.vehicle_type,first_hour numeric,additional numeric,
  fraction_minutes integer,tolerance_minutes integer,daily_amount numeric,daily_hours integer,
  intermediate_amount numeric,intermediate_hours numeric,exit_grace integer,daily_cycle_hours integer
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,private,auth
as $$
declare actor uuid; previous public.tariff_rules; next_version integer; new_id uuid; effective_at timestamptz:=clock_timestamp();
begin
  actor:=private.require_owner(target_unit);
  if first_hour<=0 or additional<=0 or fraction_minutes<=0 or tolerance_minutes<0
    or daily_amount<=0 or daily_hours<=0 or exit_grace<0 or daily_cycle_hours<=0
    or ((intermediate_amount is null) <> (intermediate_hours is null))
    or (intermediate_amount is not null and (intermediate_amount<=0 or intermediate_hours<=0))
    or daily_hours>daily_cycle_hours
    or (intermediate_hours is not null and intermediate_hours>=daily_hours)
  then raise exception 'INVALID_TARIFF' using errcode='22023'; end if;

  perform 1 from public.parking_units where id=target_unit and is_active for update;
  if not found then raise exception 'UNIT_NOT_FOUND' using errcode='P0002'; end if;
  select * into previous from public.tariff_rules
    where unit_id=target_unit and vehicle_type=target_vehicle_type and is_active and valid_until is null for update;
  select coalesce(max(version_number),0)+1 into next_version from public.tariff_rules
    where unit_id=target_unit and vehicle_type=target_vehicle_type;
  if previous.id is not null then
    update public.tariff_rules set is_active=false,valid_until=effective_at,updated_at=effective_at where id=previous.id;
  end if;
  insert into public.tariff_rules(
    unit_id,name,vehicle_type,version_number,first_hour_amount,additional_amount,
    additional_fraction_minutes,grace_minutes,daily_cap_amount,daily_after_minutes,
    intermediate_cap_amount,intermediate_after_minutes,exit_grace_minutes,daily_cycle_minutes,
    valid_from,is_active,created_by
  ) values(
    target_unit,case target_vehicle_type when 'CAR' then 'Tarifa carro v' else 'Tarifa moto v' end||next_version,
    target_vehicle_type,next_version,round(first_hour,2),round(additional,2),fraction_minutes,tolerance_minutes,
    round(daily_amount,2),daily_hours*60,
    case when intermediate_amount is null then null else round(intermediate_amount,2) end,
    case when intermediate_hours is null then null else round(intermediate_hours*60)::integer end,
    exit_grace,daily_cycle_hours*60,effective_at,true,actor
  ) returning id into new_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(
    actor,target_unit,'tariff.v2.created',jsonb_build_object(
      'vehicle_type',target_vehicle_type,'previous_tariff_id',previous.id,'new_tariff_id',new_id,
      'new_version',next_version,'intermediate_cap_amount',intermediate_amount,
      'intermediate_after_hours',intermediate_hours,'exit_grace_minutes',exit_grace,'daily_cycle_hours',daily_cycle_hours
    )
  );
  return new_id;
end;
$$;
revoke all on function public.preview_tariff_charges_v2(uuid,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer,integer[]) from public,anon;
revoke all on function public.create_tariff_version_v2(uuid,public.vehicle_type,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer) from public,anon;
grant execute on function public.preview_tariff_charges_v2(uuid,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer,integer[]) to authenticated;
grant execute on function public.create_tariff_version_v2(uuid,public.vehicle_type,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer) to authenticated;

-- 2. Planos 2.0 -------------------------------------------------------------
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
set search_path=pg_catalog,public,private,auth
as $$
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
  values(actor,target_unit,'monthly.plan.v2.created',jsonb_build_object('plan_id',new_id,'category',plan_category));
  return new_id;
end;
$$;
revoke all on function public.create_monthly_plan_v2(uuid,text,text,numeric,smallint,smallint,smallint,text,text,boolean,boolean,time,time,boolean,smallint,smallint,smallint) from public,anon;
grant execute on function public.create_monthly_plan_v2(uuid,text,text,numeric,smallint,smallint,smallint,text,text,boolean,boolean,time,time,boolean,smallint,smallint,smallint) to authenticated;

-- 3. Capacidade, zonas e demanda reprimida ---------------------------------
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
  unique(unit_id,code), unique(unit_id,name)
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

authorization_placeholder: do $$ begin null; end $$;

create or replace function public.upsert_parking_zone(
  target_zone uuid,target_unit uuid,zone_name text,zone_code text,zone_capacity integer,zone_type text,zone_priority smallint,zone_active boolean
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth
as $$
declare actor uuid; result_id uuid; allocated integer;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if zone_capacity<=0 or zone_type not in ('ROTATION','FLEX','MONTHLY','RESERVED') or zone_priority not between 1 and 100 then
    raise exception 'INVALID_ZONE' using errcode='22023'; end if;
  select coalesce(sum(capacity),0) into allocated from public.parking_zones
    where unit_id=target_unit and is_active and (target_zone is null or id<>target_zone);
  if zone_active and allocated+zone_capacity>(select capacity from public.parking_units where id=target_unit) then
    raise exception 'ZONE_CAPACITY_EXCEEDS_UNIT' using errcode='22023'; end if;
  if target_zone is null then
    insert into public.parking_zones(unit_id,name,code,capacity,zone_type,priority,is_active)
    values(target_unit,btrim(zone_name),upper(btrim(zone_code)),zone_capacity,zone_type,zone_priority,zone_active)
    returning id into result_id;
  else
    update public.parking_zones set name=btrim(zone_name),code=upper(btrim(zone_code)),capacity=zone_capacity,
      zone_type=zone_type,priority=zone_priority,is_active=zone_active,updated_at=clock_timestamp()
    where id=target_zone and unit_id=target_unit returning id into result_id;
    if result_id is null then raise exception 'ZONE_NOT_FOUND' using errcode='P0002'; end if;
  end if;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
    values(actor,target_unit,'capacity.zone.upserted',jsonb_build_object('zone_id',result_id,'capacity',zone_capacity,'type',zone_type));
  return result_id;
end;
$$;

create or replace function public.record_parking_demand_loss(
  target_unit uuid,target_reason text,target_vehicle_type public.vehicle_type,target_notes text default null
) returns bigint language plpgsql security definer
set search_path=pg_catalog,public,private,auth
as $$
declare actor uuid:=auth.uid(); new_id bigint;
begin
  if actor is null or not private.has_unit_role(target_unit,array['owner','manager','operator']::public.app_role[]) then
    raise exception 'DEMAND_EVENT_FORBIDDEN' using errcode='42501'; end if;
  if target_reason not in ('FULL','NO_ACCEPTABLE_PLAN','TURNED_AWAY','OTHER') then raise exception 'INVALID_DEMAND_REASON' using errcode='22023'; end if;
  insert into public.parking_demand_events(unit_id,reason,vehicle_type,source,notes,recorded_by)
  values(target_unit,target_reason,target_vehicle_type,case when private.has_unit_role(target_unit,array['operator']::public.app_role[]) then 'OPERATOR' else 'CEO' end,nullif(btrim(target_notes),''),actor)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.upsert_parking_zone(uuid,uuid,text,text,integer,text,smallint,boolean) from public,anon;
revoke all on function public.record_parking_demand_loss(uuid,text,public.vehicle_type,text) from public,anon;
grant execute on function public.upsert_parking_zone(uuid,uuid,text,text,integer,text,smallint,boolean) to authenticated;
grant execute on function public.record_parking_demand_loss(uuid,text,public.vehicle_type,text) to authenticated;

-- 4. Origem de aquisição ----------------------------------------------------
create table if not exists public.customer_acquisition_attribution(
  customer_id uuid primary key references public.customer_profiles(user_id) on delete cascade,
  source text not null check (source in ('GOOGLE','GOOGLE_MAPS','INSTAGRAM','REFERRAL','STOREFRONT','BUSINESS','WHATSAPP','OTHER')),
  campaign text,
  first_touch_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.customer_acquisition_attribution enable row level security;
drop policy if exists acquisition_read_management on public.customer_acquisition_attribution;
create policy acquisition_read_management on public.customer_acquisition_attribution for select to authenticated using (
  exists(select 1 from public.monthly_subscriptions s where s.customer_id=customer_id
    and private.has_unit_role(s.unit_id,array['owner','manager']::public.app_role[]))
  or customer_id=(select auth.uid())
);
revoke all on public.customer_acquisition_attribution from public,anon;
grant select on public.customer_acquisition_attribution to authenticated;
grant all on public.customer_acquisition_attribution to service_role;

-- 5. B2B --------------------------------------------------------------------
create table if not exists public.business_accounts(
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 160),
  trade_name text,
  tax_document text check (tax_document is null or tax_document ~ '^[0-9]{14}$'),
  contact_name text,
  contact_email text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.business_parking_contracts(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_accounts(id) on delete restrict,
  unit_id uuid not null references public.parking_units(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','SUSPENDED','CANCELED','ENDED')),
  price numeric(12,2) not null check (price>0),
  starts_on date not null,
  ends_on date,
  max_registered_vehicles integer not null default 1 check (max_registered_vehicles>0),
  max_simultaneous_vehicles integer not null default 1 check (max_simultaneous_vehicles>0),
  guaranteed_spaces integer not null default 0 check (guaranteed_spaces>=0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on>=starts_on),
  check (max_simultaneous_vehicles<=max_registered_vehicles),
  check (guaranteed_spaces<=max_simultaneous_vehicles)
);
create table if not exists public.business_contract_vehicles(
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.business_parking_contracts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now(),
  unique(contract_id,vehicle_id),
  check(valid_until is null or valid_until>=valid_from)
);
create index if not exists business_contracts_unit_status_idx on public.business_parking_contracts(unit_id,status);
create index if not exists business_contract_vehicles_contract_idx on public.business_contract_vehicles(contract_id,valid_until);

alter table public.business_accounts enable row level security;
alter table public.business_parking_contracts enable row level security;
alter table public.business_contract_vehicles enable row level security;
drop policy if exists business_contracts_read_management on public.business_parking_contracts;
create policy business_contracts_read_management on public.business_parking_contracts for select to authenticated using (
  private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[])
);
drop policy if exists business_accounts_read_management on public.business_accounts;
create policy business_accounts_read_management on public.business_accounts for select to authenticated using (
  exists(select 1 from public.business_parking_contracts c where c.business_id=business_accounts.id
    and private.has_unit_role(c.unit_id,array['owner','manager','finance','auditor']::public.app_role[]))
);
drop policy if exists business_contract_vehicles_read_management on public.business_contract_vehicles;
create policy business_contract_vehicles_read_management on public.business_contract_vehicles for select to authenticated using (
  exists(select 1 from public.business_parking_contracts c where c.id=contract_id
    and private.has_unit_role(c.unit_id,array['owner','manager','finance','auditor']::public.app_role[]))
);
revoke all on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles from authenticated;
grant select on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles to authenticated;
grant all on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles to service_role;

create or replace function public.create_business_parking_contract(
  target_unit uuid,business_legal_name text,business_trade_name text,business_tax_document text,
  contract_name text,contract_price numeric,contract_starts_on date,contract_max_registered integer,
  contract_max_simultaneous integer,contract_guaranteed_spaces integer
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth
as $$
declare actor uuid; business_id uuid; contract_id uuid;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if contract_price<=0 or contract_max_registered<1 or contract_max_simultaneous<1
    or contract_max_simultaneous>contract_max_registered or contract_guaranteed_spaces<0
    or contract_guaranteed_spaces>contract_max_simultaneous then raise exception 'INVALID_BUSINESS_CONTRACT' using errcode='22023'; end if;
  if nullif(regexp_replace(coalesce(business_tax_document,''),'[^0-9]','','g'),'') is not null then
    select id into business_id from public.business_accounts where tax_document=regexp_replace(business_tax_document,'[^0-9]','','g') limit 1;
  end if;
  if business_id is null then
    insert into public.business_accounts(legal_name,trade_name,tax_document)
    values(btrim(business_legal_name),nullif(btrim(business_trade_name),''),nullif(regexp_replace(coalesce(business_tax_document,''),'[^0-9]','','g'),''))
    returning id into business_id;
  end if;
  insert into public.business_parking_contracts(business_id,unit_id,name,price,starts_on,max_registered_vehicles,max_simultaneous_vehicles,guaranteed_spaces)
  values(business_id,target_unit,btrim(contract_name),round(contract_price,2),contract_starts_on,contract_max_registered,contract_max_simultaneous,contract_guaranteed_spaces)
  returning id into contract_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'business.contract.created',jsonb_build_object('business_id',business_id,'contract_id',contract_id));
  return contract_id;
end;
$$;
revoke all on function public.create_business_parking_contract(uuid,text,text,text,text,numeric,date,integer,integer,integer) from public,anon;
grant execute on function public.create_business_parking_contract(uuid,text,text,text,text,numeric,date,integer,integer,integer) to authenticated;

-- remove accidental label used only to keep migration sections visually separated
