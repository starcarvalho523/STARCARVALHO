-- Operação Comercial 2.0 — controles comerciais, aquisição e unit economics

alter table public.parking_units
  add column if not exists area_sqm numeric(12,2) check(area_sqm is null or area_sqm>0),
  add column if not exists monthly_fixed_cost numeric(12,2) check(monthly_fixed_cost is null or monthly_fixed_cost>=0);

create or replace function public.update_unit_commercial_profile(
  target_unit uuid,target_area_sqm numeric,target_monthly_fixed_cost numeric
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if target_area_sqm is not null and target_area_sqm<=0 then raise exception 'INVALID_UNIT_AREA' using errcode='22023'; end if;
  if target_monthly_fixed_cost is not null and target_monthly_fixed_cost<0 then raise exception 'INVALID_FIXED_COST' using errcode='22023'; end if;
  update public.parking_units set area_sqm=target_area_sqm,monthly_fixed_cost=target_monthly_fixed_cost,updated_at=clock_timestamp() where id=target_unit;
  if not found then raise exception 'UNIT_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'commercial.unit_profile.updated',jsonb_build_object('area_sqm',target_area_sqm,'monthly_fixed_cost',target_monthly_fixed_cost));
  return target_unit;
end $$;
revoke all on function public.update_unit_commercial_profile(uuid,numeric,numeric) from public,anon;
grant execute on function public.update_unit_commercial_profile(uuid,numeric,numeric) to authenticated;

-- A origem precisa ser por unidade: o mesmo cliente pode conhecer unidades diferentes por canais diferentes.
alter table public.customer_acquisition_attribution add column if not exists unit_id uuid references public.parking_units(id) on delete cascade;
update public.customer_acquisition_attribution a
set unit_id=coalesce(
  (select s.unit_id from public.monthly_subscriptions s where s.customer_id=a.customer_id order by s.created_at desc limit 1),
  (select ps.unit_id from public.parking_sessions ps where ps.customer_owner_id=a.customer_id order by ps.entered_at desc limit 1)
)
where a.unit_id is null;
-- Não existia fluxo de escrita antes desta migration; portanto linhas sem unidade não são válidas.
delete from public.customer_acquisition_attribution where unit_id is null;
alter table public.customer_acquisition_attribution alter column unit_id set not null;
alter table public.customer_acquisition_attribution drop constraint if exists customer_acquisition_attribution_pkey;
alter table public.customer_acquisition_attribution add primary key(unit_id,customer_id);

drop policy if exists acquisition_read_management on public.customer_acquisition_attribution;
create policy acquisition_read_management on public.customer_acquisition_attribution for select to authenticated using (
  customer_id=(select auth.uid())
  or private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[])
);

create or replace function public.set_customer_acquisition_source(
  target_unit uuid,target_customer uuid,target_source text,target_campaign text default null
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; related boolean;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if target_source not in ('GOOGLE','GOOGLE_MAPS','INSTAGRAM','REFERRAL','STOREFRONT','BUSINESS','WHATSAPP','OTHER') then
    raise exception 'INVALID_ACQUISITION_SOURCE' using errcode='22023';
  end if;
  select exists(
    select 1 from public.monthly_subscriptions s where s.unit_id=target_unit and s.customer_id=target_customer
    union all
    select 1 from public.parking_sessions ps where ps.unit_id=target_unit and ps.customer_owner_id=target_customer
    union all
    select 1 from public.vehicles v join public.parking_sessions ps on ps.vehicle_id=v.id where ps.unit_id=target_unit and v.customer_id=target_customer
  ) into related;
  if not related then raise exception 'CUSTOMER_NOT_RELATED_TO_UNIT' using errcode='42501'; end if;
  insert into public.customer_acquisition_attribution(unit_id,customer_id,source,campaign,recorded_by)
  values(target_unit,target_customer,target_source,nullif(btrim(target_campaign),''),actor)
  on conflict(unit_id,customer_id) do update set source=excluded.source,campaign=excluded.campaign,recorded_by=excluded.recorded_by,updated_at=clock_timestamp();
  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  values(actor,target_unit,'commercial.acquisition.updated',target_customer,jsonb_build_object('source',target_source,'campaign',target_campaign));
  return target_customer;
end $$;
revoke all on function public.set_customer_acquisition_source(uuid,uuid,text,text) from public,anon;
grant execute on function public.set_customer_acquisition_source(uuid,uuid,text,text) to authenticated;

create table if not exists public.marketing_spend(
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  source text not null check(source in ('GOOGLE','GOOGLE_MAPS','INSTAGRAM','REFERRAL','STOREFRONT','BUSINESS','WHATSAPP','OTHER')),
  campaign text,
  amount numeric(12,2) not null check(amount>=0),
  period_start date not null,
  period_end date not null,
  notes text check(notes is null or char_length(notes)<=500),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check(period_end>=period_start)
);
create index if not exists marketing_spend_unit_period_idx on public.marketing_spend(unit_id,period_start,period_end,source);
alter table public.marketing_spend enable row level security;
drop policy if exists marketing_spend_read_management on public.marketing_spend;
create policy marketing_spend_read_management on public.marketing_spend for select to authenticated using(
  private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[])
);
revoke all on public.marketing_spend from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.marketing_spend from authenticated;
grant select on public.marketing_spend to authenticated;
grant all on public.marketing_spend to service_role;

create or replace function public.record_marketing_spend(
  target_unit uuid,target_source text,target_campaign text,target_amount numeric,
  target_period_start date,target_period_end date,target_notes text default null
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; result_id uuid;
begin
  actor:=private.monthly_assert_admin(target_unit);
  if target_source not in ('GOOGLE','GOOGLE_MAPS','INSTAGRAM','REFERRAL','STOREFRONT','BUSINESS','WHATSAPP','OTHER')
    or target_amount<0 or target_period_start is null or target_period_end<target_period_start
  then raise exception 'INVALID_MARKETING_SPEND' using errcode='22023'; end if;
  insert into public.marketing_spend(unit_id,source,campaign,amount,period_start,period_end,notes,created_by)
  values(target_unit,target_source,nullif(btrim(target_campaign),''),round(target_amount,2),target_period_start,target_period_end,nullif(btrim(target_notes),''),actor)
  returning id into result_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'commercial.marketing_spend.recorded',jsonb_build_object('spend_id',result_id,'source',target_source,'amount',round(target_amount,2)));
  return result_id;
end $$;
revoke all on function public.record_marketing_spend(uuid,text,text,numeric,date,date,text) from public,anon;
grant execute on function public.record_marketing_spend(uuid,text,text,numeric,date,date,text) to authenticated;

-- Capacidade comercial reservada não pode exceder a capacidade física da unidade.
create or replace function private.enforce_monthly_plan_reserved_capacity()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare unit_capacity integer; reserved_plans integer; reserved_business integer; proposed integer;
begin
  select capacity into unit_capacity from public.parking_units where id=new.unit_id;
  if unit_capacity is null then raise exception 'UNIT_NOT_FOUND'; end if;
  if new.guaranteed_space and new.reserved_capacity<=0 then raise exception 'GUARANTEED_PLAN_REQUIRES_RESERVED_CAPACITY' using errcode='22023'; end if;
  select coalesce(sum(p.reserved_capacity),0)::integer into reserved_plans
  from public.monthly_plans p where p.unit_id=new.unit_id and p.enabled and p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
  select coalesce(sum(c.guaranteed_spaces),0)::integer into reserved_business
  from public.business_parking_contracts c where c.unit_id=new.unit_id and c.status='ACTIVE';
  proposed:=case when new.enabled then new.reserved_capacity else 0 end;
  if reserved_plans+reserved_business+proposed>unit_capacity then raise exception 'COMMERCIAL_RESERVED_CAPACITY_EXCEEDED' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function private.enforce_monthly_plan_reserved_capacity() from public,anon,authenticated;
drop trigger if exists enforce_monthly_plan_reserved_capacity on public.monthly_plans;
create trigger enforce_monthly_plan_reserved_capacity before insert or update of unit_id,enabled,reserved_capacity,guaranteed_space
on public.monthly_plans for each row execute function private.enforce_monthly_plan_reserved_capacity();

create or replace function private.enforce_business_reserved_capacity()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare unit_capacity integer; reserved_plans integer; reserved_business integer; proposed integer;
begin
  select capacity into unit_capacity from public.parking_units where id=new.unit_id;
  if unit_capacity is null then raise exception 'UNIT_NOT_FOUND'; end if;
  select coalesce(sum(p.reserved_capacity),0)::integer into reserved_plans from public.monthly_plans p where p.unit_id=new.unit_id and p.enabled;
  select coalesce(sum(c.guaranteed_spaces),0)::integer into reserved_business
  from public.business_parking_contracts c where c.unit_id=new.unit_id and c.status='ACTIVE' and c.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
  proposed:=case when new.status='ACTIVE' then new.guaranteed_spaces else 0 end;
  if reserved_plans+reserved_business+proposed>unit_capacity then raise exception 'COMMERCIAL_RESERVED_CAPACITY_EXCEEDED' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function private.enforce_business_reserved_capacity() from public,anon,authenticated;
drop trigger if exists enforce_business_reserved_capacity on public.business_parking_contracts;
create trigger enforce_business_reserved_capacity before insert or update of unit_id,status,guaranteed_spaces
on public.business_parking_contracts for each row execute function private.enforce_business_reserved_capacity();

-- Um plano com vaga garantida não pode vender mais contratos vivos do que reservou.
create or replace function private.enforce_guaranteed_subscription_capacity()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare p public.monthly_plans; live_count integer;
begin
  if new.plan_id is null or new.status not in ('PENDING_ACTIVATION','ACTIVE','SUSPENDED') then return new; end if;
  select * into p from public.monthly_plans where id=new.plan_id;
  if not found or not p.guaranteed_space then return new; end if;
  select count(*) into live_count from public.monthly_subscriptions s
  where s.plan_id=p.id and s.status in ('PENDING_ACTIVATION','ACTIVE','SUSPENDED')
    and s.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
  if live_count>=p.reserved_capacity then raise exception 'GUARANTEED_PLAN_SOLD_OUT' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function private.enforce_guaranteed_subscription_capacity() from public,anon,authenticated;
drop trigger if exists enforce_guaranteed_subscription_capacity on public.monthly_subscriptions;
create trigger enforce_guaranteed_subscription_capacity before insert or update of plan_id,status
on public.monthly_subscriptions for each row execute function private.enforce_guaranteed_subscription_capacity();

alter table public.monthly_plans drop constraint if exists monthly_plans_guaranteed_reserved_check;
alter table public.monthly_plans add constraint monthly_plans_guaranteed_reserved_check check(not guaranteed_space or reserved_capacity>0);

create or replace function public.create_monthly_plan_v3(
  target_unit uuid,plan_name text,plan_description text,plan_price numeric,
  plan_grace_days smallint,plan_max_vehicles smallint,plan_max_simultaneous smallint,
  plan_category text,plan_vehicle_scope text,plan_guaranteed_space boolean,
  plan_access_24h boolean,plan_access_start time,plan_access_end time,
  plan_allowed_weekdays smallint[],plan_holidays_allowed boolean,plan_daily_entry_limit smallint,
  plan_cancellation_notice_days smallint,plan_reserved_capacity smallint
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; new_id uuid; clean_days smallint[];
begin
  actor:=private.monthly_assert_admin(target_unit);
  select coalesce(array_agg(distinct d order by d),array[]::smallint[]) into clean_days from unnest(coalesce(plan_allowed_weekdays,array[]::smallint[])) d where d between 0 and 6;
  if char_length(btrim(plan_name))<2 or plan_price<=0 or plan_grace_days<0
    or plan_max_vehicles<1 or plan_max_simultaneous<1 or plan_max_simultaneous>plan_max_vehicles
    or plan_category not in ('ECONOMIC','STANDARD','GUARANTEED','BUSINESS')
    or plan_vehicle_scope not in ('CAR','MOTORCYCLE','BOTH')
    or (not plan_access_24h and(plan_access_start is null or plan_access_end is null))
    or cardinality(clean_days)=0 or plan_reserved_capacity<0
    or (plan_guaranteed_space and plan_reserved_capacity<=0)
  then raise exception 'MONTHLY_INVALID_PLAN' using errcode='22023'; end if;

  insert into public.monthly_plans(
    unit_id,name,description,price,due_day_default,grace_days,max_vehicles,max_simultaneous_vehicles,
    plan_category,vehicle_scope,guaranteed_space,access_24h,access_start,access_end,allowed_weekdays,
    holidays_allowed,daily_entry_limit,cancellation_notice_days,reserved_capacity
  ) values(
    target_unit,btrim(plan_name),nullif(btrim(plan_description),''),round(plan_price,2),1,plan_grace_days,
    plan_max_vehicles,plan_max_simultaneous,plan_category,plan_vehicle_scope,plan_guaranteed_space,
    plan_access_24h,case when plan_access_24h then null else plan_access_start end,
    case when plan_access_24h then null else plan_access_end end,clean_days,plan_holidays_allowed,
    plan_daily_entry_limit,plan_cancellation_notice_days,plan_reserved_capacity
  ) returning id into new_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'monthly.plan.v3.created',jsonb_build_object('plan_id',new_id,'category',plan_category,'allowed_weekdays',clean_days));
  return new_id;
end $$;
revoke all on function public.create_monthly_plan_v3(uuid,text,text,numeric,smallint,smallint,smallint,text,text,boolean,boolean,time,time,smallint[],boolean,smallint,smallint,smallint) from public,anon;
grant execute on function public.create_monthly_plan_v3(uuid,text,text,numeric,smallint,smallint,smallint,text,text,boolean,boolean,time,time,smallint[],boolean,smallint,smallint,smallint) to authenticated;
