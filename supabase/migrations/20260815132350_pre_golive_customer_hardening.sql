-- Hardening pré-go-live: caixa positivo, ownership histórico e adesão mensal segura.

-- Caixa: a regra é protegida pela tabela e também pela API pública.
alter table public.cash_shifts drop constraint if exists cash_shifts_opening_amount_check;
alter table public.cash_shifts add constraint cash_shifts_opening_amount_check check (opening_amount > 0) not valid;

create or replace function public.open_cash_shift(target_unit uuid,initial_amount numeric)
returns uuid language plpgsql volatile security invoker
set search_path=pg_catalog,private as $$
begin
  if initial_amount is null or initial_amount<=0 then
    raise exception 'INVALID_OPENING_AMOUNT' using errcode='22023';
  end if;
  return private.open_cash_shift(target_unit,initial_amount);
end $$;
revoke all on function public.open_cash_shift(uuid,numeric) from public,anon;
grant execute on function public.open_cash_shift(uuid,numeric) to authenticated,service_role;

-- Snapshot imutável do cliente proprietário no instante da entrada.
alter table public.parking_sessions
  add column customer_owner_id uuid references public.customer_profiles(user_id) on delete set null;
create index parking_sessions_customer_owner_entered_idx
  on public.parking_sessions(customer_owner_id,entered_at desc)
  where customer_owner_id is not null;

create or replace function private.snapshot_parking_session_owner()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
begin
  if new.customer_owner_id is null then
    select customer_id into new.customer_owner_id from public.vehicles where id=new.vehicle_id;
  end if;
  return new;
end $$;
create trigger parking_sessions_snapshot_owner
before insert on public.parking_sessions for each row
execute function private.snapshot_parking_session_owner();

-- Preserva exatamente o acesso histórico já reconhecido antes desta migration.
-- Placas atualmente sem owner continuam com snapshot nulo.
update public.parking_sessions s
set customer_owner_id=v.customer_id
from public.vehicles v
where v.id=s.vehicle_id and v.customer_id is not null and s.customer_owner_id is null;

create or replace function private.customer_owns_session(target_session uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.parking_sessions s
    where s.id=target_session and s.customer_owner_id=(select auth.uid())
  )
$$;
revoke all on function private.customer_owns_session(uuid) from public,anon,authenticated;
grant execute on function private.customer_owns_session(uuid) to authenticated,service_role;

drop policy if exists parking_sessions_read_authorized on public.parking_sessions;
drop policy if exists parking_sessions_read_customer_own on public.parking_sessions;
drop policy if exists parking_sessions_read_unit_staff on public.parking_sessions;
create policy parking_sessions_read_authorized on public.parking_sessions
for select to authenticated using(
  private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
  or customer_owner_id=(select auth.uid())
);

create or replace function public.claim_customer_vehicle(raw_plate text,target_vehicle_type public.vehicle_type)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); normalized text:=upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g'));
  existing public.vehicles; result_id uuid;
begin
  if actor is null or not exists(select 1 from public.customer_profiles where user_id=actor and is_active) then
    raise exception 'CUSTOMER_VEHICLE_FORBIDDEN' using errcode='42501';
  end if;
  if normalized !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'INVALID_PLATE' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(normalized,0));
  select * into existing from public.vehicles where normalized_plate=normalized for update;
  if found then
    if existing.customer_id is not null and existing.customer_id<>actor then
      raise exception 'VEHICLE_ALREADY_OWNED' using errcode='42501';
    end if;
    update public.vehicles set customer_id=actor,vehicle_type=target_vehicle_type,
      plate=normalized,updated_at=clock_timestamp() where id=existing.id returning id into result_id;
  else
    insert into public.vehicles(plate,normalized_plate,vehicle_type,customer_id)
    values(normalized,normalized,target_vehicle_type,actor) returning id into result_id;
  end if;
  return result_id;
end $$;
revoke all on function public.claim_customer_vehicle(text,public.vehicle_type) from public,anon;
grant execute on function public.claim_customer_vehicle(text,public.vehicle_type) to authenticated,service_role;

-- Adesão pré-ativa: não participa de coverage nem da automação, que seleciona somente ACTIVE.
alter table public.monthly_subscriptions drop constraint monthly_subscriptions_status_check;
alter table public.monthly_subscriptions add constraint monthly_subscriptions_status_check
  check(status in ('PENDING_ACTIVATION','ACTIVE','SUSPENDED','CANCELED','ENDED'));
drop index if exists monthly_subscriptions_one_live_customer_idx;
create unique index monthly_subscriptions_one_live_customer_idx
  on public.monthly_subscriptions(unit_id,customer_id)
  where status in ('PENDING_ACTIVATION','ACTIVE','SUSPENDED') and plan_id is not null;

create or replace function public.list_self_service_monthly_plans()
returns table(plan_id uuid,unit_name text,plan_name text,description text,price numeric,due_day smallint,grace_days smallint,max_vehicles smallint)
language sql stable security definer
set search_path=pg_catalog,public,auth as $$
  select p.id,u.name,p.name,p.description,p.price,p.due_day_default,p.grace_days,p.max_vehicles
  from public.monthly_plans p join public.parking_units u on u.id=p.unit_id
  where auth.uid() is not null and p.enabled
  order by u.name,p.price,p.name
$$;

create or replace function public.create_customer_monthly_enrollment(target_plan uuid,target_vehicle uuid,request_key uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); p public.monthly_plans; selected_subscription_id uuid; selected_plan_id uuid; period_id uuid; active_vehicle_count integer;
  local_day date; target_due date; target_year integer; target_month integer;
begin
  if actor is null then raise exception 'MONTHLY_SELF_SERVICE_FORBIDDEN' using errcode='42501'; end if;
  if request_key is null then raise exception 'MONTHLY_REQUEST_KEY_REQUIRED' using errcode='22023'; end if;
  if not exists(select 1 from public.vehicles where id=target_vehicle and customer_id=actor) then
    raise exception 'MONTHLY_VEHICLE_FORBIDDEN' using errcode='42501';
  end if;
  select * into p from public.monthly_plans where id=target_plan and enabled for share;
  if not found then raise exception 'MONTHLY_PLAN_UNAVAILABLE' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p.unit_id::text,0));
  select (clock_timestamp() at time zone u.timezone)::date into local_day from public.parking_units u where u.id=p.unit_id;
  select s.id,s.plan_id into selected_subscription_id,selected_plan_id from public.monthly_subscriptions s
    where s.unit_id=p.unit_id and s.customer_id=actor
      and s.status in ('PENDING_ACTIVATION','ACTIVE','SUSPENDED') and s.plan_id is not null
    order by s.created_at desc limit 1 for update;
  if selected_subscription_id is null then
    insert into public.monthly_subscriptions(customer_id,unit_id,plan_id,plan_name,status,starts_on,due_day,grace_days,contracted_price)
    values(actor,p.unit_id,p.id,p.name,'PENDING_ACTIVATION',local_day,p.due_day_default,p.grace_days,p.price)
    returning id into selected_subscription_id;
  elsif selected_plan_id<>p.id then
    raise exception 'MONTHLY_ENROLLMENT_EXISTS' using errcode='23505';
  end if;
  if not exists(select 1 from public.monthly_subscription_vehicles msv where msv.subscription_id=selected_subscription_id and msv.vehicle_id=target_vehicle and msv.valid_until is null) then
    if exists(select 1 from public.monthly_subscription_vehicles where vehicle_id=target_vehicle and valid_until is null) then
      raise exception 'MONTHLY_VEHICLE_ALREADY_ATTACHED' using errcode='23505';
    end if;
    select count(*) into active_vehicle_count from public.monthly_subscription_vehicles msv
      where msv.subscription_id=selected_subscription_id and msv.valid_until is null;
    if active_vehicle_count>=p.max_vehicles then raise exception 'MONTHLY_MAX_VEHICLES_REACHED' using errcode='23514'; end if;
    insert into public.monthly_subscription_vehicles(subscription_id,vehicle_id,valid_from,created_by)
    values(selected_subscription_id,target_vehicle,local_day,actor);
  end if;
  target_year:=extract(year from local_day); target_month:=extract(month from local_day);
  target_due:=private.monthly_due_date(target_year,target_month,p.due_day_default);
  insert into public.monthly_billing_periods(subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount)
  values(selected_subscription_id,p.unit_id,target_year,target_month,date_trunc('month',local_day)::date,
    (date_trunc('month',local_day)+interval '1 month - 1 day')::date,target_due,target_due+p.grace_days,p.price)
  on conflict(subscription_id,reference_year,reference_month) do update set subscription_id=excluded.subscription_id
  returning id into period_id;
  return jsonb_build_object('subscription_id',selected_subscription_id,'billing_period_id',period_id,'status','PENDING_ACTIVATION');
end $$;

create or replace function private.activate_monthly_subscription_after_payment()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    update public.monthly_subscriptions set status='ACTIVE',updated_at=clock_timestamp()
    where id=new.subscription_id and status='PENDING_ACTIVATION';
  end if;
  return new;
end $$;
create trigger monthly_activate_after_payment
after update of status on public.monthly_billing_periods for each row
execute function private.activate_monthly_subscription_after_payment();

revoke all on function public.list_self_service_monthly_plans() from public,anon;
revoke all on function public.create_customer_monthly_enrollment(uuid,uuid,uuid) from public,anon;
revoke all on function private.activate_monthly_subscription_after_payment() from public,anon,authenticated;
grant execute on function public.list_self_service_monthly_plans() to authenticated,service_role;
grant execute on function public.create_customer_monthly_enrollment(uuid,uuid,uuid) to authenticated,service_role;
grant execute on function private.activate_monthly_subscription_after_payment() to service_role;
