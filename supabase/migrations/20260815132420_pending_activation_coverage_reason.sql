create or replace function public.resolve_monthly_vehicle_coverage(
  target_vehicle uuid,target_unit uuid,at_time timestamptz default now()
)
returns table(
  covered boolean,subscription_id uuid,plan_id uuid,billing_period_id uuid,
  subscription_status text,billing_status text,due_date date,grace_until date,
  coverage_until date,reason text
)
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
  order by case s.status when 'ACTIVE' then 0 when 'PENDING_ACTIVATION' then 1 when 'SUSPENDED' then 2 else 3 end,s.created_at desc limit 1;
  if not found then
    return query select false,null::uuid,null::uuid,null::uuid,null::text,null::text,null::date,null::date,null::date,'VEHICLE_NOT_COVERED'::text;
    return;
  end if;
  if candidate.status='PENDING_ACTIVATION' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'AWAITING_FIRST_PAYMENT'::text;
    return;
  end if;
  if candidate.status='SUSPENDED' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_SUSPENDED'::text;
    return;
  end if;
  if candidate.status='CANCELED' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_CANCELED'::text;
    return;
  end if;
  if candidate.status<>'ACTIVE' then
    return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'SUBSCRIPTION_ENDED'::text;
    return;
  end if;
  if candidate.billing_id is null then
    return query select false,candidate.id,candidate.plan_id,null::uuid,candidate.status,null::text,null::date,null::date,candidate.valid_until,'NO_BILLING_PERIOD'::text;
    return;
  end if;
  if candidate.billing_state='PAID' then
    return query select true,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'ACTIVE_PAID'::text;
    return;
  end if;
  if candidate.billing_state='PENDING' and local_day<=candidate.grace_until then
    return query select true,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'ACTIVE_WITHIN_GRACE'::text;
    return;
  end if;
  return query select false,candidate.id,candidate.plan_id,candidate.billing_id,candidate.status,candidate.billing_state,candidate.due_date,candidate.grace_until,candidate.valid_until,'OVERDUE_OUTSIDE_GRACE'::text;
end $$;

revoke all on function public.resolve_monthly_vehicle_coverage(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.resolve_monthly_vehicle_coverage(uuid,uuid,timestamptz) to authenticated,service_role;
