-- Fase 4: núcleo de planos, assinaturas, veículos cobertos e competências.
-- Não integra pagamentos e não altera parking_sessions/payments.

create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  price numeric(12,2) not null check (price > 0),
  billing_cycle text not null default 'MONTHLY' check (billing_cycle = 'MONTHLY'),
  due_day_default smallint not null check (due_day_default between 1 and 31),
  grace_days smallint not null default 0 check (grace_days between 0 and 90),
  max_vehicles smallint not null default 1 check (max_vehicles between 1 and 100),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, name)
);

alter table public.monthly_subscriptions
  drop constraint monthly_subscriptions_status_check,
  drop constraint monthly_subscriptions_check,
  alter column vehicle_id drop not null,
  alter column starts_at drop not null,
  alter column expires_at drop not null,
  alter column plan_name drop not null,
  add column plan_id uuid references public.monthly_plans(id),
  add column starts_on date,
  add column ends_on date,
  add column due_day smallint check (due_day between 1 and 31),
  add column grace_days smallint check (grace_days between 0 and 90),
  add column contracted_price numeric(12,2) check (contracted_price > 0),
  add column suspended_at timestamptz,
  add column suspension_reason text,
  add column canceled_at timestamptz,
  add column cancellation_reason text,
  add column cancel_at_period_end boolean not null default false,
  add constraint monthly_subscriptions_status_check
    check (status in ('ACTIVE','SUSPENDED','CANCELED','ENDED')),
  add constraint monthly_subscriptions_dates_check
    check (ends_on is null or ends_on >= starts_on),
  add constraint monthly_subscriptions_new_contract_check
    check (
      (plan_id is null and starts_on is null and due_day is null and grace_days is null and contracted_price is null)
      or
      (plan_id is not null and starts_on is not null and due_day is not null and grace_days is not null and contracted_price is not null)
    );

comment on column public.monthly_subscriptions.vehicle_id is
  'Legado preservado. Novos vínculos usam monthly_subscription_vehicles.';
comment on column public.monthly_subscriptions.plan_name is
  'Snapshot textual legado; novos contratos também preservam o nome do plano.';

create table public.monthly_subscription_vehicles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.monthly_subscriptions(id),
  vehicle_id uuid not null references public.vehicles(id),
  valid_from date not null,
  valid_until date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  check (valid_until is null or valid_until >= valid_from)
);

create unique index monthly_subscription_vehicles_one_active_idx
  on public.monthly_subscription_vehicles(vehicle_id)
  where valid_until is null;
create index monthly_subscription_vehicles_vehicle_idx
  on public.monthly_subscription_vehicles(vehicle_id, valid_from, valid_until);
create index monthly_subscription_vehicles_created_by_idx
  on public.monthly_subscription_vehicles(created_by);

create table public.monthly_billing_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.monthly_subscriptions(id),
  unit_id uuid not null references public.parking_units(id),
  reference_year integer not null check (reference_year between 2000 and 2200),
  reference_month smallint not null check (reference_month between 1 and 12),
  period_start date not null,
  period_end date not null,
  due_date date not null,
  grace_until date not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING','PAID','WAIVED','CANCELED','MANUAL_REVIEW')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (due_date between period_start and period_end),
  check (grace_until >= due_date),
  check ((status = 'PAID' and paid_at is not null) or (status <> 'PAID' and paid_at is null)),
  unique (subscription_id, reference_year, reference_month)
);

create index monthly_plans_unit_enabled_idx on public.monthly_plans(unit_id, enabled);
create index monthly_subscriptions_plan_idx on public.monthly_subscriptions(plan_id);
create index monthly_subscriptions_unit_customer_status_idx
  on public.monthly_subscriptions(unit_id, customer_id, status);
create unique index monthly_subscriptions_one_live_customer_idx
  on public.monthly_subscriptions(unit_id, customer_id)
  where status in ('ACTIVE','SUSPENDED') and plan_id is not null;
create index monthly_billing_periods_unit_due_idx
  on public.monthly_billing_periods(unit_id, due_date, status);
create index monthly_billing_periods_subscription_idx
  on public.monthly_billing_periods(subscription_id, reference_year desc, reference_month desc);

alter table public.monthly_plans enable row level security;
alter table public.monthly_subscription_vehicles enable row level security;
alter table public.monthly_billing_periods enable row level security;

create policy monthly_plans_read_authorized on public.monthly_plans
for select to authenticated using (
  private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
  or exists (
    select 1 from public.monthly_subscriptions s
    where s.plan_id=monthly_plans.id and s.customer_id=(select auth.uid())
  )
);

drop policy if exists monthly_read_unit_staff on public.monthly_subscriptions;
create policy monthly_subscriptions_read_authorized on public.monthly_subscriptions
for select to authenticated using (
  customer_id=(select auth.uid())
  or private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
);

create policy monthly_subscription_vehicles_read_authorized on public.monthly_subscription_vehicles
for select to authenticated using (exists (
  select 1 from public.monthly_subscriptions s
  where s.id=subscription_id and (
    s.customer_id=(select auth.uid())
    or private.has_unit_role(s.unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
  )
));

create policy monthly_billing_periods_read_authorized on public.monthly_billing_periods
for select to authenticated using (exists (
  select 1 from public.monthly_subscriptions s
  where s.id=subscription_id and (
    s.customer_id=(select auth.uid())
    or private.has_unit_role(s.unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
  )
));

revoke all on public.monthly_plans, public.monthly_subscription_vehicles,
  public.monthly_billing_periods from public, anon;
revoke insert, update, delete, truncate, references, trigger on
  public.monthly_plans, public.monthly_subscriptions,
  public.monthly_subscription_vehicles, public.monthly_billing_periods from authenticated;
grant select on public.monthly_plans, public.monthly_subscriptions,
  public.monthly_subscription_vehicles, public.monthly_billing_periods to authenticated;
grant all on public.monthly_plans, public.monthly_subscription_vehicles,
  public.monthly_billing_periods to service_role;

create or replace function private.monthly_assert_admin(target_unit uuid)
returns uuid language plpgsql security invoker
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not private.has_unit_role(target_unit,array['owner','manager']::public.app_role[]) then
    raise exception 'MONTHLY_ADMIN_FORBIDDEN' using errcode='42501';
  end if;
  return actor;
end $$;

create or replace function private.monthly_due_date(target_year integer,target_month integer,target_day integer)
returns date language sql immutable strict security invoker
set search_path = pg_catalog as $$
  select make_date(target_year,target_month,1)
    + (least(target_day,extract(day from (make_date(target_year,target_month,1)+interval '1 month - 1 day'))::integer)-1)
$$;

create or replace function public.create_monthly_plan(
  target_unit uuid, plan_name text, plan_description text, plan_price numeric,
  plan_due_day smallint, plan_grace_days smallint default 0, plan_max_vehicles smallint default 1
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; new_id uuid;
begin
  actor:=private.monthly_assert_admin(target_unit);
  insert into public.monthly_plans(unit_id,name,description,price,due_day_default,grace_days,max_vehicles)
  values(target_unit,btrim(plan_name),nullif(btrim(plan_description),''),plan_price,plan_due_day,plan_grace_days,plan_max_vehicles)
  returning id into new_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'monthly.plan.created',jsonb_build_object('plan_id',new_id));
  return new_id;
end $$;

create or replace function public.set_monthly_plan_enabled(target_plan uuid,target_enabled boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; plan_row public.monthly_plans%rowtype;
begin
  select * into plan_row from public.monthly_plans where id=target_plan for update;
  if not found then raise exception 'MONTHLY_PLAN_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.monthly_assert_admin(plan_row.unit_id);
  update public.monthly_plans set enabled=target_enabled,updated_at=now() where id=target_plan;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,plan_row.unit_id,'monthly.plan.updated',jsonb_build_object('plan_id',target_plan,'enabled',target_enabled));
end $$;

create or replace function public.create_monthly_subscription(
  target_unit uuid,target_customer uuid,target_plan uuid,target_starts_on date,
  override_due_day smallint default null,override_grace_days smallint default null,
  override_price numeric default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; plan_row public.monthly_plans%rowtype; new_id uuid;
begin
  actor:=private.monthly_assert_admin(target_unit);
  select * into plan_row from public.monthly_plans where id=target_plan and unit_id=target_unit for share;
  if not found or not plan_row.enabled then raise exception 'MONTHLY_PLAN_UNAVAILABLE' using errcode='P0002'; end if;
  if not exists(select 1 from public.customer_profiles where user_id=target_customer and is_active) then
    raise exception 'MONTHLY_CUSTOMER_NOT_FOUND' using errcode='P0002';
  end if;
  insert into public.monthly_subscriptions(
    customer_id,unit_id,plan_id,plan_name,status,starts_on,due_day,grace_days,contracted_price
  ) values(
    target_customer,target_unit,target_plan,plan_row.name,'ACTIVE',target_starts_on,
    coalesce(override_due_day,plan_row.due_day_default),
    coalesce(override_grace_days,plan_row.grace_days),coalesce(override_price,plan_row.price)
  ) returning id into new_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  values(actor,target_unit,'monthly.subscription.created',target_customer,
    jsonb_build_object('subscription_id',new_id,'plan_id',target_plan));
  return new_id;
end $$;

create or replace function public.set_monthly_subscription_status(
  target_subscription uuid,target_status text,reason text default null,
  effective_at_period_end boolean default false
) returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; s public.monthly_subscriptions%rowtype;
begin
  select * into s from public.monthly_subscriptions where id=target_subscription for update;
  if not found then raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.monthly_assert_admin(s.unit_id);
  if (s.status,target_status) not in (('ACTIVE','SUSPENDED'),('SUSPENDED','ACTIVE'),('ACTIVE','CANCELED'),('SUSPENDED','CANCELED')) then
    raise exception 'MONTHLY_INVALID_STATUS_TRANSITION' using errcode='23514';
  end if;
  if target_status='SUSPENDED' then
    update public.monthly_subscriptions set status='SUSPENDED',suspended_at=now(),suspension_reason=nullif(btrim(reason),''),updated_at=now() where id=s.id;
  elsif target_status='ACTIVE' then
    update public.monthly_subscriptions set status='ACTIVE',suspended_at=null,suspension_reason=null,updated_at=now() where id=s.id;
  else
    update public.monthly_subscriptions set status='CANCELED',canceled_at=now(),cancellation_reason=nullif(btrim(reason),''),cancel_at_period_end=effective_at_period_end,updated_at=now() where id=s.id;
  end if;
  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  values(actor,s.unit_id,case target_status when 'SUSPENDED' then 'monthly.subscription.suspended' when 'ACTIVE' then 'monthly.subscription.reactivated' else 'monthly.subscription.canceled' end,s.customer_id,
    jsonb_build_object('subscription_id',s.id,'from_status',s.status,'to_status',target_status,'at_period_end',effective_at_period_end));
end $$;

create or replace function public.attach_monthly_vehicle(target_subscription uuid,target_vehicle uuid,target_valid_from date default current_date)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; s public.monthly_subscriptions%rowtype; p public.monthly_plans%rowtype; new_id uuid; active_count integer;
begin
  select * into s from public.monthly_subscriptions where id=target_subscription for update;
  if not found then raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.monthly_assert_admin(s.unit_id);
  if s.status not in ('ACTIVE','SUSPENDED') then raise exception 'MONTHLY_SUBSCRIPTION_INACTIVE' using errcode='23514'; end if;
  select * into p from public.monthly_plans where id=s.plan_id;
  if not exists(select 1 from public.vehicles where id=target_vehicle and customer_id=s.customer_id) then
    raise exception 'MONTHLY_VEHICLE_CUSTOMER_MISMATCH' using errcode='23503';
  end if;
  select count(*) into active_count from public.monthly_subscription_vehicles where subscription_id=s.id and valid_until is null;
  if active_count >= p.max_vehicles then raise exception 'MONTHLY_MAX_VEHICLES_REACHED' using errcode='23514'; end if;
  insert into public.monthly_subscription_vehicles(subscription_id,vehicle_id,valid_from,created_by)
  values(s.id,target_vehicle,target_valid_from,actor) returning id into new_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  values(actor,s.unit_id,'monthly.vehicle.attached',s.customer_id,jsonb_build_object('subscription_id',s.id,'vehicle_id',target_vehicle,'link_id',new_id));
  return new_id;
end $$;

create or replace function public.detach_monthly_vehicle(target_link uuid,target_valid_until date default current_date)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; link_row public.monthly_subscription_vehicles%rowtype; s public.monthly_subscriptions%rowtype;
begin
  select * into link_row from public.monthly_subscription_vehicles where id=target_link for update;
  if not found then raise exception 'MONTHLY_VEHICLE_LINK_NOT_FOUND' using errcode='P0002'; end if;
  select * into s from public.monthly_subscriptions where id=link_row.subscription_id;
  actor:=private.monthly_assert_admin(s.unit_id);
  if link_row.valid_until is not null then return; end if;
  if target_valid_until < link_row.valid_from then raise exception 'MONTHLY_INVALID_VEHICLE_END_DATE' using errcode='22007'; end if;
  update public.monthly_subscription_vehicles set valid_until=target_valid_until where id=target_link;
  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  values(actor,s.unit_id,'monthly.vehicle.detached',s.customer_id,jsonb_build_object('subscription_id',s.id,'vehicle_id',link_row.vehicle_id,'link_id',target_link));
end $$;

create or replace function public.generate_monthly_billing_period(target_subscription uuid,target_year integer,target_month integer)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare actor uuid; s public.monthly_subscriptions%rowtype; period_first date; period_last date; target_due date; existing_id uuid; new_id uuid;
begin
  select * into s from public.monthly_subscriptions where id=target_subscription for update;
  if not found or s.plan_id is null then raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.monthly_assert_admin(s.unit_id);
  period_first:=make_date(target_year,target_month,1);
  period_last:=(period_first+interval '1 month - 1 day')::date;
  if period_last<s.starts_on or (s.ends_on is not null and period_first>s.ends_on) then raise exception 'MONTHLY_PERIOD_OUTSIDE_CONTRACT' using errcode='23514'; end if;
  select id into existing_id from public.monthly_billing_periods where subscription_id=s.id and reference_year=target_year and reference_month=target_month;
  if existing_id is not null then return existing_id; end if;
  target_due:=private.monthly_due_date(target_year,target_month,s.due_day);
  insert into public.monthly_billing_periods(subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount)
  values(s.id,s.unit_id,target_year,target_month,period_first,period_last,target_due,target_due+s.grace_days,s.contracted_price)
  on conflict(subscription_id,reference_year,reference_month) do nothing returning id into new_id;
  if new_id is null then select id into new_id from public.monthly_billing_periods where subscription_id=s.id and reference_year=target_year and reference_month=target_month; end if;
  if not exists(select 1 from public.audit_logs where action='monthly.billing_period.created' and metadata->>'billing_period_id'=new_id::text) then
    insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
    values(actor,s.unit_id,'monthly.billing_period.created',s.customer_id,jsonb_build_object('subscription_id',s.id,'billing_period_id',new_id,'reference_year',target_year,'reference_month',target_month));
  end if;
  return new_id;
end $$;

create or replace function public.resolve_monthly_vehicle_coverage(target_vehicle uuid,target_unit uuid,at_time timestamptz default now())
returns table(covered boolean,subscription_id uuid,plan_id uuid,billing_period_id uuid,subscription_status text,billing_status text,due_date date,grace_until date,coverage_until date,reason text)
language plpgsql security definer
set search_path = pg_catalog, public, private, auth as $$
declare local_day date; candidate record; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'MONTHLY_COVERAGE_FORBIDDEN' using errcode='42501'; end if;
  if not (private.customer_owns_vehicle(target_vehicle) or private.has_unit_role(target_unit,array['owner','manager','operator','finance','auditor']::public.app_role[])) then
    raise exception 'MONTHLY_COVERAGE_FORBIDDEN' using errcode='42501';
  end if;
  select (at_time at time zone u.timezone)::date into local_day from public.parking_units u where u.id=target_unit;
  if local_day is null then raise exception 'MONTHLY_UNIT_NOT_FOUND' using errcode='P0002'; end if;
  select s.id,s.plan_id,s.status,v.valid_until,b.id billing_id,b.status billing_state,b.due_date,b.grace_until
  into candidate
  from public.monthly_subscription_vehicles v
  join public.monthly_subscriptions s on s.id=v.subscription_id and s.unit_id=target_unit
  left join lateral (
    select period.id,period.status,period.due_date,period.grace_until
    from public.monthly_billing_periods period
    where period.subscription_id=s.id and period.period_start<=local_day
    order by period.period_start desc
    limit 1
  ) b on true
  where v.vehicle_id=target_vehicle and v.valid_from<=local_day and (v.valid_until is null or v.valid_until>=local_day)
  order by case s.status when 'ACTIVE' then 0 when 'SUSPENDED' then 1 else 2 end,s.created_at desc limit 1;
  if not found then return query select false,null::uuid,null::uuid,null::uuid,null::text,null::text,null::date,null::date,null::date,'VEHICLE_NOT_COVERED'::text; return; end if;
  if candidate.status='SUSPENDED' then return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_SUSPENDED'::text; return; end if;
  if candidate.status='CANCELED' then return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_CANCELED'::text; return; end if;
  if candidate.status<>'ACTIVE' then return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_ENDED'::text; return; end if;
  if candidate.billing_id is null then return query select false,candidate.id,candidate.plan_id,null::uuid,candidate.status,null::text,null::date,null::date,candidate.valid_until,'NO_BILLING_PERIOD'::text; return; end if;
  if candidate.billing_state='PAID' then return query select true,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'ACTIVE_PAID'::text; return; end if;
  if candidate.billing_state='PENDING' and local_day<=candidate.grace_until then return query select true,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'ACTIVE_WITHIN_GRACE'::text; return; end if;
  return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'OVERDUE_OUTSIDE_GRACE'::text;
end $$;

revoke all on function private.monthly_assert_admin(uuid) from public,anon,authenticated;
revoke all on function private.monthly_due_date(integer,integer,integer) from public,anon,authenticated;

revoke all on function public.create_monthly_plan(uuid,text,text,numeric,smallint,smallint,smallint) from public,anon;
revoke all on function public.set_monthly_plan_enabled(uuid,boolean) from public,anon;
revoke all on function public.create_monthly_subscription(uuid,uuid,uuid,date,smallint,smallint,numeric) from public,anon;
revoke all on function public.set_monthly_subscription_status(uuid,text,text,boolean) from public,anon;
revoke all on function public.attach_monthly_vehicle(uuid,uuid,date) from public,anon;
revoke all on function public.detach_monthly_vehicle(uuid,date) from public,anon;
revoke all on function public.generate_monthly_billing_period(uuid,integer,integer) from public,anon;
revoke all on function public.resolve_monthly_vehicle_coverage(uuid,uuid,timestamptz) from public,anon;

grant execute on function public.create_monthly_plan(uuid,text,text,numeric,smallint,smallint,smallint) to authenticated;
grant execute on function public.set_monthly_plan_enabled(uuid,boolean) to authenticated;
grant execute on function public.create_monthly_subscription(uuid,uuid,uuid,date,smallint,smallint,numeric) to authenticated;
grant execute on function public.set_monthly_subscription_status(uuid,text,text,boolean) to authenticated;
grant execute on function public.attach_monthly_vehicle(uuid,uuid,date) to authenticated;
grant execute on function public.detach_monthly_vehicle(uuid,date) to authenticated;
grant execute on function public.generate_monthly_billing_period(uuid,integer,integer) to authenticated;
grant execute on function public.resolve_monthly_vehicle_coverage(uuid,uuid,timestamptz) to authenticated;

grant execute on function private.monthly_assert_admin(uuid) to service_role;
grant execute on function private.monthly_due_date(integer,integer,integer) to service_role;
grant execute on function public.create_monthly_plan(uuid,text,text,numeric,smallint,smallint,smallint) to service_role;
grant execute on function public.set_monthly_plan_enabled(uuid,boolean) to service_role;
grant execute on function public.create_monthly_subscription(uuid,uuid,uuid,date,smallint,smallint,numeric) to service_role;
grant execute on function public.set_monthly_subscription_status(uuid,text,text,boolean) to service_role;
grant execute on function public.attach_monthly_vehicle(uuid,uuid,date) to service_role;
grant execute on function public.detach_monthly_vehicle(uuid,date) to service_role;
grant execute on function public.generate_monthly_billing_period(uuid,integer,integer) to service_role;
grant execute on function public.resolve_monthly_vehicle_coverage(uuid,uuid,timestamptz) to service_role;

