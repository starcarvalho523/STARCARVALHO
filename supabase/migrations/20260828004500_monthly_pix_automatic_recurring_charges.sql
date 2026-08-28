create or replace function private.monthly_business_days_between(start_day date, end_day date)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case when end_day <= start_day then 0 else count(*)::integer end
  from generate_series(start_day + 1, end_day, interval '1 day') d
  where extract(isodow from d) between 1 and 5
$$;

create or replace function private.ensure_monthly_pix_automatic_due_periods(target_unit uuid, target_day date)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  item record;
  ref_date date;
  due_date_value date;
  month_start date;
  month_end date;
  business_days integer;
  created_count integer := 0;
begin
  for item in
    select s.id,s.unit_id,s.starts_on,s.ends_on,s.due_day,s.grace_days,s.contracted_price
      from public.monthly_subscriptions s
      join public.monthly_recurring_provider_bindings b on b.subscription_id=s.id
     where s.unit_id=target_unit and s.status='ACTIVE' and s.plan_id is not null
       and b.provider='ASAAS' and b.method='PIX_AUTOMATIC' and b.authorization_status='ACTIVE'
     for update of s
  loop
    foreach ref_date in array array[target_day, (date_trunc('month',target_day)::date + interval '1 month')::date]
    loop
      month_start:=date_trunc('month',ref_date)::date;
      month_end:=(month_start + interval '1 month - 1 day')::date;
      if item.starts_on is null or item.starts_on>month_end or (item.ends_on is not null and item.ends_on<month_start) then continue; end if;
      due_date_value:=private.monthly_due_date(extract(year from ref_date)::integer,extract(month from ref_date)::integer,item.due_day);
      business_days:=private.monthly_business_days_between(target_day,due_date_value);
      if business_days<2 or business_days>10 then continue; end if;
      insert into public.monthly_billing_periods(subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount)
      values(item.id,item.unit_id,extract(year from ref_date)::integer,extract(month from ref_date)::smallint,month_start,month_end,due_date_value,due_date_value+item.grace_days,item.contracted_price)
      on conflict(subscription_id,reference_year,reference_month) do nothing;
      if found then created_count:=created_count+1; end if;
    end loop;
  end loop;
  return created_count;
end;
$$;

create or replace function public.prepare_monthly_pix_automatic_due_periods()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  unit_row record;
  local_day date;
  created_count integer:=0;
  unit_count integer;
begin
  if (select auth.role())<>'service_role' then raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501'; end if;
  for unit_row in select id,timezone from public.parking_units loop
    local_day:=(clock_timestamp() at time zone unit_row.timezone)::date;
    unit_count:=private.ensure_monthly_pix_automatic_due_periods(unit_row.id,local_day);
    created_count:=created_count+unit_count;
  end loop;
  return jsonb_build_object('created',created_count);
end;
$$;

revoke all on function private.monthly_business_days_between(date,date) from public,anon,authenticated;
revoke all on function private.ensure_monthly_pix_automatic_due_periods(uuid,date) from public,anon,authenticated;
revoke all on function public.prepare_monthly_pix_automatic_due_periods() from public,anon,authenticated;
grant execute on function public.prepare_monthly_pix_automatic_due_periods() to service_role;

create or replace function public.list_monthly_pix_automatic_due_charges()
returns table(billing_period_id uuid,due_date date)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if (select auth.role())<>'service_role' then raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501'; end if;
  return query
  select bp.id,bp.due_date
    from public.monthly_billing_periods bp
    join public.monthly_subscriptions s on s.id=bp.subscription_id
    join public.monthly_recurring_provider_bindings b on b.subscription_id=s.id and b.provider='ASAAS' and b.method='PIX_AUTOMATIC'
    join public.parking_units u on u.id=bp.unit_id
   where bp.status='PENDING' and s.status='ACTIVE' and b.authorization_status='ACTIVE'
     and private.monthly_business_days_between((clock_timestamp() at time zone u.timezone)::date,bp.due_date) between 2 and 10
     and not exists(select 1 from public.payments p where p.monthly_billing_period_id=bp.id and p.status in ('PENDING','PAID'))
   order by bp.due_date,bp.id;
end;
$$;

revoke all on function public.list_monthly_pix_automatic_due_charges() from public,anon,authenticated;
grant execute on function public.list_monthly_pix_automatic_due_charges() to service_role;

create or replace function public.reserve_monthly_pix_automatic_charge(
  target_period uuid,
  target_environment text,
  request_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  period_row public.monthly_billing_periods;
  subscription_row public.monthly_subscriptions;
  binding public.monthly_recurring_provider_bindings;
  current_payment public.payments;
  current_transaction private.payment_provider_transactions;
  payment_id uuid:=gen_random_uuid();
  transaction_id uuid:=gen_random_uuid();
  external_ref text;
  local_day date;
  business_days integer;
begin
  if (select auth.role())<>'service_role' then raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501'; end if;
  if target_environment not in ('SANDBOX','PRODUCTION') then raise exception 'PAYMENT_PROVIDER_ENVIRONMENT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('MONTHLY_PIX_AUTOMATIC:'||target_period::text,0));
  select * into period_row from public.monthly_billing_periods where id=target_period for update;
  if not found then raise exception 'MONTHLY_BILLING_PERIOD_NOT_FOUND'; end if;
  if period_row.status<>'PENDING' then return jsonb_build_object('state',period_row.status,'isCreator',false); end if;
  select * into subscription_row from public.monthly_subscriptions where id=period_row.subscription_id for update;
  if not found or subscription_row.status<>'ACTIVE' then raise exception 'MONTHLY_SUBSCRIPTION_NOT_ACTIVE'; end if;
  select * into binding from public.monthly_recurring_provider_bindings b where b.subscription_id=subscription_row.id and b.provider='ASAAS' and b.method='PIX_AUTOMATIC' for update;
  if not found or binding.authorization_status<>'ACTIVE' or binding.provider_authorization_id is null or binding.provider_customer_id is null then raise exception 'MONTHLY_PIX_AUTOMATIC_AUTHORIZATION_NOT_ACTIVE'; end if;
  select (clock_timestamp() at time zone timezone)::date into local_day from public.parking_units where id=period_row.unit_id;
  business_days:=private.monthly_business_days_between(local_day,period_row.due_date);
  if business_days<2 or business_days>10 then raise exception 'MONTHLY_PIX_AUTOMATIC_OUTSIDE_CREATION_WINDOW'; end if;
  if not exists(select 1 from public.payment_method_availability a where a.unit_id=period_row.unit_id and a.payment_method='PIX' and a.payment_channel='QR' and a.payment_provider='ASAAS' and a.enabled and a.configuration_state='READY') then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;

  select * into current_payment from public.payments where monthly_billing_period_id=target_period and status in ('PENDING','PAID') order by created_at asc limit 1 for update;
  if found then
    select * into current_transaction from private.payment_provider_transactions where payment_id=current_payment.id for update;
    return jsonb_build_object('paymentId',current_payment.id,'transactionId',current_transaction.id,'state',coalesce(current_transaction.state,current_payment.status),'amount',period_row.amount,'dueDate',period_row.due_date,'providerCustomerId',binding.provider_customer_id,'providerAuthorizationId',binding.provider_authorization_id,'externalReference',current_transaction.external_reference,'providerPaymentId',current_transaction.provider_payment_id,'isCreator',false);
  end if;

  external_ref:='starcarvalhos:monthly:auto:'||period_row.id::text;
  insert into public.payments(id,unit_id,monthly_billing_period_id,payment_subject_type,amount,gross_amount,method,status,provider,payment_channel,manual_confirmation,idempotency_key,provider_environment)
  values(payment_id,period_row.unit_id,period_row.id,'MONTHLY_BILLING_PERIOD',period_row.amount,period_row.amount,'PIX','PENDING','ASAAS','QR',false,request_key,target_environment);
  insert into private.payment_provider_transactions(id,payment_id,provider,environment,state,provider_customer_id,external_reference)
  values(transaction_id,payment_id,'ASAAS',target_environment,'CREATING',binding.provider_customer_id,external_ref);
  return jsonb_build_object('paymentId',payment_id,'transactionId',transaction_id,'state','CREATING','amount',period_row.amount,'dueDate',period_row.due_date,'providerCustomerId',binding.provider_customer_id,'providerAuthorizationId',binding.provider_authorization_id,'externalReference',external_ref,'providerPaymentId',null,'isCreator',true);
end;
$$;

revoke all on function public.reserve_monthly_pix_automatic_charge(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_monthly_pix_automatic_charge(uuid,text,uuid) to service_role;
