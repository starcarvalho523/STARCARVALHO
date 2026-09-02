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
     and not exists(select 1 from public.payments paid where paid.monthly_billing_period_id=bp.id and paid.status='PAID')
     and (
       not exists(select 1 from public.payments p where p.monthly_billing_period_id=bp.id and p.status='PENDING')
       or exists(
         select 1 from public.payments p
         join private.payment_provider_transactions t on t.payment_id=p.id
         where p.monthly_billing_period_id=bp.id and p.status='PENDING'
           and p.provider='ASAAS' and p.method='PIX'
           and t.external_reference='starcarvalhos:monthly:auto:'||bp.id::text
           and t.provider_payment_id is null
           and t.state in ('CREATING','RECONCILING','CREATE_FAILED','RECONCILIATION_FAILED')
       )
     )
   order by bp.due_date,bp.id;
end;
$$;

create or replace function public.reserve_monthly_pix_automatic_charge(
  target_period uuid,target_environment text,request_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  period_row public.monthly_billing_periods; subscription_row public.monthly_subscriptions; binding public.monthly_recurring_provider_bindings;
  current_payment public.payments; current_transaction private.payment_provider_transactions;
  payment_id uuid:=gen_random_uuid(); transaction_id uuid:=gen_random_uuid(); external_ref text; local_day date; business_days integer;
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
  external_ref:='starcarvalhos:monthly:auto:'||period_row.id::text;

  select * into current_payment from public.payments where monthly_billing_period_id=target_period and status in ('PENDING','PAID') order by created_at asc limit 1 for update;
  if found then
    if current_payment.status='PAID' then return jsonb_build_object('state','PAID','isCreator',false); end if;
    if current_payment.provider<>'ASAAS' or current_payment.method<>'PIX' then raise exception 'MONTHLY_PAYMENT_METHOD_CHANGE_BLOCKED'; end if;
    select * into current_transaction from private.payment_provider_transactions where payment_id=current_payment.id for update;
    if not found or current_transaction.external_reference<>external_ref then raise exception 'MONTHLY_PIX_AUTOMATIC_EXISTING_PAYMENT_CONFLICT'; end if;
    return jsonb_build_object('paymentId',current_payment.id,'transactionId',current_transaction.id,'state',current_transaction.state,'amount',period_row.amount,'dueDate',period_row.due_date,'providerCustomerId',binding.provider_customer_id,'providerAuthorizationId',binding.provider_authorization_id,'externalReference',external_ref,'providerPaymentId',current_transaction.provider_payment_id,'isCreator',current_transaction.provider_payment_id is null);
  end if;

  insert into public.payments(id,unit_id,monthly_billing_period_id,payment_subject_type,amount,gross_amount,method,status,provider,payment_channel,manual_confirmation,idempotency_key,provider_environment)
  values(payment_id,period_row.unit_id,period_row.id,'MONTHLY_BILLING_PERIOD',period_row.amount,period_row.amount,'PIX','PENDING','ASAAS','QR',false,request_key,target_environment);
  insert into private.payment_provider_transactions(id,payment_id,provider,environment,state,provider_customer_id,external_reference)
  values(transaction_id,payment_id,'ASAAS',target_environment,'CREATING',binding.provider_customer_id,external_ref);
  return jsonb_build_object('paymentId',payment_id,'transactionId',transaction_id,'state','CREATING','amount',period_row.amount,'dueDate',period_row.due_date,'providerCustomerId',binding.provider_customer_id,'providerAuthorizationId',binding.provider_authorization_id,'externalReference',external_ref,'providerPaymentId',null,'isCreator',true);
end;
$$;

create or replace function public.mark_monthly_pix_automatic_charge_created(
  target_transaction uuid,target_provider_payment_id text,target_provider_customer_id text,target_provider_status text,target_reported_amount numeric,target_external_reference text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  tx private.payment_provider_transactions;
  payment_row public.payments;
begin
  if (select auth.role())<>'service_role' then raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501'; end if;
  select * into tx from private.payment_provider_transactions where id=target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into payment_row from public.payments where id=tx.payment_id for update;
  if not found or payment_row.payment_subject_type<>'MONTHLY_BILLING_PERIOD' or payment_row.provider<>'ASAAS' or payment_row.method<>'PIX' then raise exception 'MONTHLY_PIX_AUTOMATIC_PAYMENT_MISMATCH'; end if;
  if tx.external_reference<>target_external_reference or payment_row.amount<>target_reported_amount then raise exception 'MONTHLY_PIX_AUTOMATIC_CHARGE_MISMATCH'; end if;
  if tx.provider_customer_id is not null and target_provider_customer_id is not null and tx.provider_customer_id<>target_provider_customer_id then raise exception 'MONTHLY_PIX_AUTOMATIC_CUSTOMER_MISMATCH'; end if;
  if tx.provider_payment_id is not null and tx.provider_payment_id<>target_provider_payment_id then raise exception 'MONTHLY_PIX_AUTOMATIC_PROVIDER_PAYMENT_MISMATCH'; end if;
  update private.payment_provider_transactions set state='PENDING',provider_payment_id=target_provider_payment_id,provider_customer_id=coalesce(target_provider_customer_id,tx.provider_customer_id),provider_status=target_provider_status,updated_at=clock_timestamp() where id=tx.id;
  update public.payments set provider_reference=target_provider_payment_id,provider_environment=tx.environment where id=payment_row.id;
end;
$$;

revoke all on function public.list_monthly_pix_automatic_due_charges() from public,anon,authenticated;
revoke all on function public.reserve_monthly_pix_automatic_charge(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.mark_monthly_pix_automatic_charge_created(uuid,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.list_monthly_pix_automatic_due_charges() to service_role;
grant execute on function public.reserve_monthly_pix_automatic_charge(uuid,text,uuid) to service_role;
grant execute on function public.mark_monthly_pix_automatic_charge_created(uuid,text,text,text,numeric,text) to service_role;
