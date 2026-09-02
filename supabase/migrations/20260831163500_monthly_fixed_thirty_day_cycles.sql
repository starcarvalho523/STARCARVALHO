create or replace function private.monthly_cycle_next_date(anchor date)
returns date
language sql
immutable strict
set search_path to 'pg_catalog'
as $$ select anchor + 30 $$;

create or replace function private.monthly_cycle_end(anchor date)
returns date
language sql
immutable strict
set search_path to 'pg_catalog'
as $$ select anchor + 29 $$;

alter table public.monthly_billing_periods
  drop constraint if exists monthly_billing_periods_subscription_id_reference_year_refe_key;

alter table public.monthly_billing_periods
  add constraint monthly_billing_periods_subscription_due_key unique(subscription_id,due_date);

alter table public.monthly_billing_periods
  add constraint monthly_billing_periods_thirty_day_length_check
  check (period_end = period_start + 29) not valid;

alter table public.monthly_billing_periods
  add constraint monthly_billing_periods_due_at_cycle_start_check
  check (due_date = period_start) not valid;

create or replace function private.enforce_monthly_thirty_day_next_billing_date()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare last_paid_due date;
begin
  if coalesce(new.cancel_at_period_end,false) then
    new.next_billing_date := null;
    return new;
  end if;

  if coalesce(new.auto_renew,false)
     and coalesce(new.renewal_provider,'')='ASAAS'
     and coalesce(new.preferred_payment_method::text,'') in ('CREDIT_CARD','CARD') then
    select max(bp.due_date)
      into last_paid_due
      from public.monthly_billing_periods bp
     where bp.subscription_id=new.id
       and bp.status='PAID';
    if last_paid_due is not null then
      new.next_billing_date := private.monthly_cycle_next_date(last_paid_due);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists monthly_enforce_thirty_day_next_billing_date on public.monthly_subscriptions;
create trigger monthly_enforce_thirty_day_next_billing_date
before insert or update on public.monthly_subscriptions
for each row execute function private.enforce_monthly_thirty_day_next_billing_date();

create or replace function private.normalize_monthly_thirty_day_after_period_paid()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
begin
  if new.status='PAID' and (tg_op='INSERT' or old.status is distinct from 'PAID') then
    update public.monthly_subscriptions s
       set next_billing_date=private.monthly_cycle_next_date(new.due_date),
           updated_at=clock_timestamp()
     where s.id=new.subscription_id
       and coalesce(s.auto_renew,false)
       and coalesce(s.cancel_at_period_end,false)=false
       and coalesce(s.renewal_provider,'')='ASAAS'
       and coalesce(s.preferred_payment_method::text,'') in ('CREDIT_CARD','CARD');
  end if;
  return new;
end $$;

drop trigger if exists monthly_normalize_thirty_day_after_period_paid on public.monthly_billing_periods;
create trigger monthly_normalize_thirty_day_after_period_paid
after insert or update of status on public.monthly_billing_periods
for each row execute function private.normalize_monthly_thirty_day_after_period_paid();

create or replace function public.create_customer_monthly_enrollment(target_plan uuid, target_vehicle uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','auth'
as $$
declare
  actor uuid:=auth.uid();
  p public.monthly_plans;
  selected_subscription_id uuid;
  selected_plan_id uuid;
  period_id uuid;
  active_vehicle_count integer;
  local_day date;
  cycle_due date;
  cycle_end date;
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
  cycle_due:=local_day;
  cycle_end:=private.monthly_cycle_end(cycle_due);

  select s.id,s.plan_id into selected_subscription_id,selected_plan_id
    from public.monthly_subscriptions s
   where s.unit_id=p.unit_id and s.customer_id=actor
     and s.status in ('PENDING_ACTIVATION','ACTIVE','SUSPENDED') and s.plan_id is not null
   order by s.created_at desc limit 1 for update;

  if selected_subscription_id is null then
    insert into public.monthly_subscriptions(customer_id,unit_id,plan_id,plan_name,status,starts_on,due_day,grace_days,contracted_price)
    values(actor,p.unit_id,p.id,p.name,'PENDING_ACTIVATION',local_day,extract(day from local_day)::smallint,p.grace_days,p.price)
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

  insert into public.monthly_billing_periods(
    subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount
  ) values(
    selected_subscription_id,p.unit_id,extract(year from cycle_due)::integer,extract(month from cycle_due)::smallint,
    cycle_due,cycle_end,cycle_due,cycle_due+p.grace_days,p.price
  )
  on conflict(subscription_id,due_date) do update set subscription_id=excluded.subscription_id
  returning id into period_id;

  return jsonb_build_object('subscription_id',selected_subscription_id,'billing_period_id',period_id,'status','PENDING_ACTIVATION');
end $$;

create or replace function private.generate_current_monthly_billing_periods_for_unit(
  target_unit uuid,
  target_day date,
  dry_run boolean default false,
  run_source text default 'CRON',
  actor uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','auth'
as $$
declare
  item record;
  latest record;
  next_due date;
  new_period_id uuid;
  run_id uuid;
  p_processed_count integer := 0;
  p_created_count integer := 0;
  p_existing_count integer := 0;
  p_skipped_count integer := 0;
  p_failed_count integer := 0;
  p_contracted_amount numeric(12,2) := 0;
begin
  if target_unit is null or target_day is null or run_source not in ('CRON','MANUAL') then
    raise exception 'MONTHLY_AUTOMATION_INVALID_REQUEST' using errcode='22023';
  end if;

  if not dry_run then
    insert into public.monthly_billing_generation_runs(unit_id,source,target_date,created_by)
    values(target_unit,run_source,target_day,actor)
    returning id into run_id;
  end if;

  for item in
    select s.id,s.unit_id,s.starts_on,s.ends_on,s.grace_days,s.contracted_price
      from public.monthly_subscriptions s
     where s.unit_id=target_unit
       and s.status='ACTIVE'
       and s.plan_id is not null
     for update of s
  loop
    p_processed_count:=p_processed_count+1;

    select bp.id,bp.status,bp.due_date,bp.period_end
      into latest
      from public.monthly_billing_periods bp
     where bp.subscription_id=item.id
     order by bp.due_date desc
     limit 1;

    if latest.id is null then
      next_due:=item.starts_on;
    elsif latest.status<>'PAID' then
      p_existing_count:=p_existing_count+1;
      continue;
    else
      next_due:=private.monthly_cycle_next_date(latest.due_date);
    end if;

    if next_due is null
       or (item.ends_on is not null and next_due>item.ends_on)
       or next_due>target_day+10 then
      p_skipped_count:=p_skipped_count+1;
      continue;
    end if;

    if exists(select 1 from public.monthly_billing_periods bp where bp.subscription_id=item.id and bp.due_date=next_due) then
      p_existing_count:=p_existing_count+1;
      continue;
    end if;

    if dry_run then
      p_created_count:=p_created_count+1;
      p_contracted_amount:=p_contracted_amount+item.contracted_price;
      continue;
    end if;

    begin
      insert into public.monthly_billing_periods(
        subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount
      ) values(
        item.id,item.unit_id,extract(year from next_due)::integer,extract(month from next_due)::smallint,
        next_due,private.monthly_cycle_end(next_due),next_due,next_due+item.grace_days,item.contracted_price
      )
      on conflict(subscription_id,due_date) do nothing
      returning id into new_period_id;

      if new_period_id is null then
        p_existing_count:=p_existing_count+1;
      else
        p_created_count:=p_created_count+1;
        p_contracted_amount:=p_contracted_amount+item.contracted_price;
      end if;
    exception when others then
      p_failed_count:=p_failed_count+1;
    end;
  end loop;

  if run_id is not null then
    update public.monthly_billing_generation_runs
       set processed_count=p_processed_count,
           created_count=p_created_count,
           existing_count=p_existing_count,
           skipped_count=p_skipped_count,
           failed_count=p_failed_count,
           contracted_amount=p_contracted_amount,
           finished_at=clock_timestamp()
     where id=run_id;
  end if;

  return jsonb_build_object(
    'processed',p_processed_count,
    'created',p_created_count,
    'existing',p_existing_count,
    'skipped',p_skipped_count,
    'failed',p_failed_count,
    'contractedAmount',p_contracted_amount,
    'dryRun',dry_run,
    'runId',run_id
  );
end $$;

create or replace function public.generate_monthly_billing_period(target_subscription uuid,target_year integer,target_month integer)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','auth'
as $$
declare
  actor uuid;
  s public.monthly_subscriptions%rowtype;
  month_first date;
  month_last date;
  cycle_due date;
  existing_id uuid;
  new_id uuid;
begin
  select * into s from public.monthly_subscriptions where id=target_subscription for update;
  if not found or s.plan_id is null then raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.monthly_assert_admin(s.unit_id);
  month_first:=make_date(target_year,target_month,1);
  month_last:=(month_first+interval '1 month - 1 day')::date;

  select id into existing_id
    from public.monthly_billing_periods
   where subscription_id=s.id
     and due_date between month_first and month_last
   order by due_date asc
   limit 1;
  if existing_id is not null then return existing_id; end if;

  cycle_due:=s.starts_on;
  while cycle_due<month_first loop
    cycle_due:=private.monthly_cycle_next_date(cycle_due);
  end loop;
  if cycle_due>month_last or (s.ends_on is not null and cycle_due>s.ends_on) then
    raise exception 'MONTHLY_NO_30_DAY_CYCLE_IN_TARGET_MONTH' using errcode='23514';
  end if;

  insert into public.monthly_billing_periods(
    subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount
  ) values(
    s.id,s.unit_id,extract(year from cycle_due)::integer,extract(month from cycle_due)::smallint,
    cycle_due,private.monthly_cycle_end(cycle_due),cycle_due,cycle_due+s.grace_days,s.contracted_price
  )
  on conflict(subscription_id,due_date) do nothing
  returning id into new_id;

  if new_id is null then
    select id into new_id from public.monthly_billing_periods where subscription_id=s.id and due_date=cycle_due;
  end if;

  if not exists(select 1 from public.audit_logs where action='monthly.billing_period.created' and metadata->>'billing_period_id'=new_id::text) then
    insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
    values(actor,s.unit_id,'monthly.billing_period.created',s.customer_id,
      jsonb_build_object('subscription_id',s.id,'billing_period_id',new_id,'due_date',cycle_due,'cycle_days',30));
  end if;
  return new_id;
end $$;

update public.monthly_subscriptions s
   set next_billing_date=x.next_due,
       updated_at=clock_timestamp()
  from (
    select bp.subscription_id,private.monthly_cycle_next_date(max(bp.due_date)) as next_due
      from public.monthly_billing_periods bp
     where bp.status='PAID'
     group by bp.subscription_id
  ) x
 where s.id=x.subscription_id
   and coalesce(s.auto_renew,false)
   and coalesce(s.cancel_at_period_end,false)=false
   and coalesce(s.renewal_provider,'')='ASAAS'
   and coalesce(s.preferred_payment_method::text,'') in ('CREDIT_CARD','CARD');