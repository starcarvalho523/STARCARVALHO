-- Corrige a avaliação booleana de feriado detectada na homologação QA.
create or replace function public.resolve_monthly_vehicle_coverage(
  target_vehicle uuid,target_unit uuid,at_time timestamptz default now()
) returns table(
  covered boolean,subscription_id uuid,plan_id uuid,billing_period_id uuid,
  subscription_status text,billing_status text,due_date date,grace_until date,
  coverage_until date,reason text
) language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare
  local_day date;
  local_time time;
  local_dow smallint;
  candidate record;
  actor uuid:=auth.uid();
  simultaneous_count integer:=0;
  today_entries integer:=0;
  holiday boolean:=false;
begin
  if actor is null then raise exception 'MONTHLY_COVERAGE_FORBIDDEN' using errcode='42501'; end if;
  if not(private.customer_owns_vehicle(target_vehicle) or private.has_unit_role(target_unit,array['owner','manager','operator','finance','auditor']::public.app_role[])) then
    raise exception 'MONTHLY_COVERAGE_FORBIDDEN' using errcode='42501';
  end if;

  select (at_time at time zone u.timezone)::date,
         (at_time at time zone u.timezone)::time,
         extract(dow from (at_time at time zone u.timezone))::smallint
    into local_day,local_time,local_dow
  from public.parking_units u where u.id=target_unit;
  if local_day is null then raise exception 'MONTHLY_UNIT_NOT_FOUND' using errcode='P0002'; end if;

  select
    s.id,s.plan_id,s.status,v.valid_until,b.id billing_id,b.status billing_state,b.due_date,b.grace_until,
    p.vehicle_scope,p.max_simultaneous_vehicles,p.access_24h,p.access_start,p.access_end,
    p.allowed_weekdays,p.holidays_allowed,p.daily_entry_limit,veh.vehicle_type
  into candidate
  from public.monthly_subscription_vehicles v
  join public.monthly_subscriptions s on s.id=v.subscription_id and s.unit_id=target_unit
  join public.monthly_plans p on p.id=s.plan_id
  join public.vehicles veh on veh.id=v.vehicle_id
  left join lateral(
    select period.id,period.status,period.due_date,period.grace_until
    from public.monthly_billing_periods period
    where period.subscription_id=s.id and period.period_start<=local_day
    order by period.period_start desc limit 1
  ) b on true
  where v.vehicle_id=target_vehicle and v.valid_from<=local_day and(v.valid_until is null or v.valid_until>=local_day)
  order by case s.status when 'ACTIVE' then 0 when 'PENDING_ACTIVATION' then 1 when 'SUSPENDED' then 2 else 3 end,s.created_at desc
  limit 1;

  if not found then
    return query select false,null::uuid,null::uuid,null::uuid,null::text,null::text,null::date,null::date,null::date,'VEHICLE_NOT_COVERED'::text; return;
  end if;
  if candidate.status='PENDING_ACTIVATION' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'AWAITING_FIRST_PAYMENT'::text; return;
  end if;
  if candidate.status='SUSPENDED' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_SUSPENDED'::text; return;
  end if;
  if candidate.status='CANCELED' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_CANCELED'::text; return;
  end if;
  if candidate.status<>'ACTIVE' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_ENDED'::text; return;
  end if;
  if candidate.billing_id is null then
    return query select false,candidate.id,candidate.plan_id,null::uuid,candidate.status,null::text,null::date,null::date,candidate.valid_until,'NO_BILLING_PERIOD'::text; return;
  end if;
  if candidate.billing_state<>'PAID' and not(candidate.billing_state='PENDING' and local_day<=candidate.grace_until) then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'OVERDUE_OUTSIDE_GRACE'::text; return;
  end if;

  if candidate.vehicle_scope<>'BOTH' and candidate.vehicle_scope<>candidate.vehicle_type::text then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'VEHICLE_TYPE_NOT_ALLOWED'::text; return;
  end if;
  if candidate.allowed_weekdays is not null and not(local_dow=any(candidate.allowed_weekdays)) then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'WEEKDAY_NOT_ALLOWED'::text; return;
  end if;

  select exists(
    select 1 from public.parking_calendar_dates c
    where c.unit_id=target_unit and c.calendar_date=local_day and c.is_holiday
  ) into holiday;
  if holiday and not candidate.holidays_allowed then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'HOLIDAY_NOT_ALLOWED'::text; return;
  end if;

  if not candidate.access_24h then
    if candidate.access_start<=candidate.access_end then
      if local_time<candidate.access_start or local_time>candidate.access_end then
        return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'OUTSIDE_ACCESS_WINDOW'::text; return;
      end if;
    else
      if local_time<candidate.access_start and local_time>candidate.access_end then
        return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'OUTSIDE_ACCESS_WINDOW'::text; return;
      end if;
    end if;
  end if;

  select count(*) into simultaneous_count
  from public.parking_sessions ps
  where ps.monthly_subscription_id=candidate.id
    and ps.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE'
    and ps.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW');
  if simultaneous_count>=coalesce(candidate.max_simultaneous_vehicles,1) then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SIMULTANEOUS_LIMIT_REACHED'::text; return;
  end if;

  if candidate.daily_entry_limit is not null then
    select count(*) into today_entries
    from public.parking_sessions ps
    join public.parking_units pu on pu.id=ps.unit_id
    where ps.monthly_subscription_id=candidate.id
      and (ps.entered_at at time zone pu.timezone)::date=local_day
      and ps.status<>'CANCELLED';
    if today_entries>=candidate.daily_entry_limit then
      return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'DAILY_ENTRY_LIMIT_REACHED'::text; return;
    end if;
  end if;

  if candidate.billing_state='PAID' then
    return query select true,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'ACTIVE_PAID'::text; return;
  end if;
  return query select true,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'ACTIVE_WITHIN_GRACE'::text;
end $$;
