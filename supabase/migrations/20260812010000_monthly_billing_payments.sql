-- Phase 7: real payments for monthly billing periods.
-- This migration keeps every historical parking payment unchanged and adds a
-- second, referentially-safe financial subject.

create type public.payment_subject_type as enum ('PARKING_SESSION','MONTHLY_BILLING_PERIOD');

alter table public.payments
  add column payment_subject_type public.payment_subject_type,
  add column monthly_billing_period_id uuid;

update public.payments
set payment_subject_type='PARKING_SESSION'
where payment_subject_type is null and parking_session_id is not null;

do $$
begin
  if exists(select 1 from public.payments where payment_subject_type is null or parking_session_id is null) then
    raise exception 'PAYMENTS_HISTORICAL_BACKFILL_INCOMPLETE';
  end if;
end $$;

alter table public.payments
  add constraint payments_monthly_billing_period_fkey
    foreign key(monthly_billing_period_id) references public.monthly_billing_periods(id) on delete restrict,
  add constraint payments_subject_xor_check check(
    (payment_subject_type='PARKING_SESSION' and parking_session_id is not null and monthly_billing_period_id is null)
    or
    (payment_subject_type='MONTHLY_BILLING_PERIOD' and parking_session_id is null and monthly_billing_period_id is not null)
  ) not valid;

alter table public.payments validate constraint payments_subject_xor_check;
alter table public.payments alter column parking_session_id drop not null;
alter table public.payments alter column payment_subject_type set not null;
alter table public.payments alter column payment_subject_type set default 'PARKING_SESSION';

create index payments_monthly_billing_period_idx
  on public.payments(monthly_billing_period_id,created_at desc)
  where monthly_billing_period_id is not null;
create unique index payments_one_current_per_monthly_period_idx
  on public.payments(monthly_billing_period_id)
  where monthly_billing_period_id is not null and status in ('PENDING','PAID');

create or replace function private.customer_owns_monthly_billing_period(target_period uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.monthly_billing_periods b
    join public.monthly_subscriptions s on s.id=b.subscription_id
    where b.id=target_period and s.customer_id=(select auth.uid())
  )
$$;

drop policy if exists payments_read_authorized on public.payments;
drop policy if exists payments_read_unit_staff on public.payments;
create policy payments_read_authorized on public.payments
for select to authenticated using(
  private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])
  or (payment_subject_type='PARKING_SESSION' and private.customer_owns_session(parking_session_id))
  or (payment_subject_type='MONTHLY_BILLING_PERIOD' and exists(
    select 1 from public.monthly_billing_periods b
    join public.monthly_subscriptions s on s.id=b.subscription_id
    where b.id=payments.monthly_billing_period_id and s.customer_id=(select auth.uid())
  ))
);

create or replace function private.authorize_monthly_payment(target_period uuid)
returns public.monthly_billing_periods language plpgsql stable security definer
set search_path=pg_catalog,public,private,auth as $$
declare period_row public.monthly_billing_periods; actor uuid:=(select auth.uid());
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select * into period_row from public.monthly_billing_periods where id=target_period;
  if not found then raise exception 'MONTHLY_BILLING_PERIOD_NOT_FOUND' using errcode='P0002'; end if;
  if not (
    private.customer_owns_monthly_billing_period(period_row.id)
    or private.has_unit_role(period_row.unit_id,array['owner','manager','operator']::public.app_role[])
  ) then raise exception 'MONTHLY_PAYMENT_FORBIDDEN' using errcode='42501'; end if;
  return period_row;
end $$;

create or replace function private.monthly_payment_json(target_period uuid,target_method public.parking_payment_method default null)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,private as $$
  select jsonb_build_object(
    'paymentId',p.id,'transactionId',t.id,'state',coalesce(t.state,p.status::text),
    'providerStatus',t.provider_status,'qrCodePayload',t.qr_code_payload,
    'qrCodeImageBase64',t.qr_code_image_base64,'expiresAt',t.expires_at,
    'hostedPaymentUrl',t.hosted_payment_url,'amount',p.amount,'method',p.method,
    'isCreator',false
  )
  from public.payments p
  left join private.payment_provider_transactions t on t.payment_id=p.id
  where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
    and p.monthly_billing_period_id=target_period
    and (target_method is null or p.method=target_method)
    and p.status in ('PENDING','PAID')
  order by p.created_at desc limit 1
$$;

create or replace function private.reserve_monthly_provider_payment(
  target_period uuid,target_method public.parking_payment_method,
  target_channel public.payment_channel,request_key uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare period_row public.monthly_billing_periods; current_payment public.payments; current_transaction private.payment_provider_transactions; existing jsonb;
  payment_id uuid:=gen_random_uuid(); transaction_id uuid:=gen_random_uuid(); actor uuid:=(select auth.uid());
begin
  period_row:=private.authorize_monthly_payment(target_period);
  if target_method not in ('PIX','CREDIT_CARD')
    or (target_method='PIX' and target_channel<>'QR')
    or (target_method='CREDIT_CARD' and target_channel<>'HOSTED_CHECKOUT') then
    raise exception 'MONTHLY_PAYMENT_METHOD_NOT_AVAILABLE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('MONTHLY_BILLING_PERIOD:'||target_period::text,0));
  select * into period_row from public.monthly_billing_periods where id=target_period for update;
  if period_row.status='PAID' then return jsonb_build_object('state','PAID','amount',period_row.amount,'isCreator',false); end if;
  if period_row.status in ('WAIVED','CANCELED') then raise exception 'MONTHLY_BILLING_PERIOD_NOT_PAYABLE'; end if;
  if period_row.status<>'PENDING' then raise exception 'MONTHLY_BILLING_PERIOD_REVIEW_REQUIRED'; end if;

  select * into current_payment from public.payments
   where monthly_billing_period_id=target_period and status in ('PENDING','PAID') for update;
  if found then
    if current_payment.method<>target_method then raise exception 'MONTHLY_PAYMENT_METHOD_CHANGE_BLOCKED'; end if;
    select private.monthly_payment_json(target_period,target_method) into existing;
    select * into current_transaction from private.payment_provider_transactions where payment_id=current_payment.id for update;
    if target_method='PIX' and current_transaction.state in ('PROVIDER_CREATED','QR_PENDING') then
      update private.payment_provider_transactions set state='QR_FETCHING',updated_at=clock_timestamp() where id=current_transaction.id;
      return existing||jsonb_build_object('state','QR_FETCHING','isCreator',true);
    end if;
    if current_transaction.state in ('CREATE_FAILED','RECONCILIATION_FAILED')
      or (current_transaction.state in ('CREATING','RECONCILING') and current_transaction.updated_at<clock_timestamp()-interval '5 minutes') then
      update private.payment_provider_transactions set state='RECONCILING',updated_at=clock_timestamp() where id=current_transaction.id;
      return existing||jsonb_build_object('state','RECONCILING','isCreator',true);
    end if;
    return existing;
  end if;

  if not exists(select 1 from public.payment_method_availability a where a.unit_id=period_row.unit_id
    and a.payment_method=target_method::text and a.payment_channel=target_channel
    and a.payment_provider='ASAAS' and a.enabled and a.configuration_state='READY') then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE';
  end if;

  insert into public.payments(id,unit_id,parking_session_id,monthly_billing_period_id,payment_subject_type,
    amount,gross_amount,method,status,provider,payment_channel,manual_confirmation,idempotency_key)
  values(payment_id,period_row.unit_id,null,period_row.id,'MONTHLY_BILLING_PERIOD',period_row.amount,
    period_row.amount,target_method,'PENDING','ASAAS',target_channel,false,request_key);
  insert into private.payment_provider_transactions(id,payment_id,provider,environment,state,external_reference)
  values(transaction_id,payment_id,'ASAAS','SANDBOX','CREATING',
    'starcarvalhos:monthly:'||md5(period_row.id::text||':'||payment_id::text));
  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  select actor,period_row.unit_id,'monthly.payment.reserved',s.customer_id,
    jsonb_build_object('billing_period_id',period_row.id,'payment_id',payment_id,'method',target_method,'channel',target_channel)
  from public.monthly_subscriptions s where s.id=period_row.subscription_id;
  return jsonb_build_object('paymentId',payment_id,'transactionId',transaction_id,'state','CREATING',
    'amount',period_row.amount,'method',target_method,'isCreator',true);
exception when unique_violation then
  select private.monthly_payment_json(target_period,target_method) into existing;
  if existing is not null then return existing; end if;
  raise;
end $$;

create or replace function public.reserve_monthly_pix_payment(billing_period_id uuid,request_key uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  return private.reserve_monthly_provider_payment(billing_period_id,'PIX','QR',request_key);
end $$;

create or replace function public.reserve_monthly_credit_checkout(billing_period_id uuid,request_key uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  return private.reserve_monthly_provider_payment(billing_period_id,'CREDIT_CARD','HOSTED_CHECKOUT',request_key);
end $$;

create or replace function public.get_monthly_provider_payment(billing_period_id uuid,payment_method public.parking_payment_method)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,auth as $$
begin
  perform private.authorize_monthly_payment(billing_period_id);
  return private.monthly_payment_json(billing_period_id,payment_method);
end $$;

create or replace function public.record_monthly_cash_payment(billing_period_id uuid,request_key uuid)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare period_row public.monthly_billing_periods; shift_row public.cash_shifts; actor uuid:=(select auth.uid());
  payment_id uuid; current_payment public.payments;
begin
  period_row:=private.authorize_monthly_payment(billing_period_id);
  if not private.has_unit_role(period_row.unit_id,array['owner','manager','operator']::public.app_role[]) then
    raise exception 'MONTHLY_CASH_OPERATOR_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('MONTHLY_BILLING_PERIOD:'||billing_period_id::text,0));
  select * into period_row from public.monthly_billing_periods where id=billing_period_id for update;
  if period_row.status='PAID' then
    select id into payment_id from public.payments where monthly_billing_period_id=period_row.id and status='PAID';
    return payment_id;
  end if;
  if period_row.status<>'PENDING' then raise exception 'MONTHLY_BILLING_PERIOD_NOT_PAYABLE'; end if;
  select * into current_payment from public.payments where monthly_billing_period_id=period_row.id and status in ('PENDING','PAID') for update;
  if found then raise exception 'MONTHLY_PAYMENT_METHOD_CHANGE_BLOCKED'; end if;
  select * into shift_row from public.cash_shifts where unit_id=period_row.unit_id and operator_id=actor and status='OPEN' for update;
  if not found then raise exception 'CASH_SHIFT_REQUIRED'; end if;
  if not exists(select 1 from public.payment_method_availability a where a.unit_id=period_row.unit_id
    and a.payment_method='CASH' and a.payment_channel='MANUAL' and a.payment_provider='INTERNAL'
    and a.enabled and a.configuration_state='READY') then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
  insert into public.payments(unit_id,parking_session_id,monthly_billing_period_id,payment_subject_type,
    amount,gross_amount,method,status,provider,payment_channel,operational_status,settlement_status,
    manual_confirmation,paid_at,received_by,cash_shift_id,idempotency_key)
  values(period_row.unit_id,null,period_row.id,'MONTHLY_BILLING_PERIOD',period_row.amount,period_row.amount,
    'CASH','PAID','INTERNAL','MANUAL','APPROVED','SETTLED',true,clock_timestamp(),actor,shift_row.id,request_key)
  returning id into payment_id;
  update public.monthly_billing_periods set status='PAID',paid_at=clock_timestamp(),updated_at=clock_timestamp()
   where id=period_row.id and status='PENDING';
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,period_row.unit_id,'monthly.payment.cash_confirmed',jsonb_build_object(
    'billing_period_id',period_row.id,'payment_id',payment_id,'cash_shift_id',shift_row.id));
  return payment_id;
exception when unique_violation then
  select id into payment_id from public.payments where idempotency_key=request_key
    and monthly_billing_period_id=billing_period_id;
  if payment_id is not null then return payment_id; end if;
  raise;
end $$;

-- Central subject transition. Provider wrappers call this only after their
-- existing reference, method and amount reconciliation succeeds.
create or replace function private.mark_payment_subject_paid(target_payment uuid,target_settled boolean default false)
returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare p public.payments; period_row public.monthly_billing_periods;
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.payment_subject_type='PARKING_SESSION' then
    update public.parking_sessions set status='PAID',payment_status='PAID',updated_at=clock_timestamp()
    where id=p.parking_session_id and status='PAYMENT_PENDING' and payment_status='PENDING';
  else
    select * into period_row from public.monthly_billing_periods where id=p.monthly_billing_period_id for update;
    if period_row.status in ('WAIVED','CANCELED') then raise exception 'MONTHLY_BILLING_PERIOD_NOT_PAYABLE'; end if;
    if period_row.amount<>p.amount then
      update public.monthly_billing_periods set status='MANUAL_REVIEW',updated_at=clock_timestamp() where id=period_row.id;
      raise exception 'MONTHLY_PAYMENT_AMOUNT_MISMATCH';
    end if;
    update public.monthly_billing_periods set status='PAID',paid_at=coalesce(p.paid_at,clock_timestamp()),updated_at=clock_timestamp()
    where id=period_row.id and status='PENDING';
  end if;
  update public.payments set status='PAID',operational_status='APPROVED',
    settlement_status=case when target_settled then 'SETTLED' else settlement_status end,
    paid_at=coalesce(paid_at,clock_timestamp()) where id=p.id and status in ('PENDING','PAID');
end $$;

create or replace function private.mark_payment_subject_review(target_payment uuid,target_reason text)
returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare p public.payments;
begin
  select * into p from public.payments where id=target_payment for update;
  if p.payment_subject_type='PARKING_SESSION' then
    update public.parking_sessions set status='MANUAL_REVIEW',updated_at=clock_timestamp()
     where id=p.parking_session_id and status='PAYMENT_PENDING';
  else
    update public.monthly_billing_periods set status='MANUAL_REVIEW',updated_at=clock_timestamp()
     where id=p.monthly_billing_period_id and status='PENDING';
  end if;
  insert into public.audit_logs(unit_id,action,metadata) values
    (p.unit_id,'provider.reconciliation.failed',jsonb_build_object('payment_id',p.id,'reason',left(target_reason,100)));
end $$;

create or replace function private.mark_provider_manual_review(target_transaction uuid,reason_code text)
returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare payment_id uuid;
begin
  select t.payment_id into payment_id from private.payment_provider_transactions t where t.id=target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  update private.payment_provider_transactions set state='RECONCILIATION_FAILED',failure_code=left(reason_code,100),updated_at=clock_timestamp()
   where id=target_transaction;
  perform private.mark_payment_subject_review(payment_id,reason_code);
end $$;

create or replace function private.mark_provider_external_created(
  target_transaction uuid,external_payment_id text,external_customer_id text,
  external_status text,external_amount numeric,supplied_external_reference text,invoice_url text
) returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare t private.payment_provider_transactions; p public.payments;
begin
  select * into t from private.payment_provider_transactions where id=target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into p from public.payments where id=t.payment_id for update;
  if p.status<>'PENDING' then raise exception 'PAYMENT_NOT_READY'; end if;
  if external_payment_id is null or supplied_external_reference<>t.external_reference then raise exception 'PROVIDER_REFERENCE_MISMATCH'; end if;
  if external_amount is null or external_amount<>p.amount then raise exception 'PROVIDER_AMOUNT_MISMATCH'; end if;
  update private.payment_provider_transactions set state='PROVIDER_CREATED',provider_payment_id=external_payment_id,
    provider_customer_id=external_customer_id,provider_status=external_status,provider_amount=external_amount,
    hosted_payment_url=invoice_url,failure_code=null,failure_description=null,updated_at=clock_timestamp()
  where id=t.id;
  update public.payments set provider_reference=external_payment_id where id=p.id;
  insert into public.audit_logs(unit_id,action,metadata) values
    (p.unit_id,'provider.external_persisted',jsonb_build_object('payment_id',p.id,'subject',p.payment_subject_type,'provider','ASAAS'));
end $$;

create or replace function private.mark_credit_checkout_created(
  target_transaction uuid,checkout_id text,checkout_status text,checkout_link text,
  supplied_external_reference text,checkout_amount numeric,expiration timestamptz
) returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare t private.payment_provider_transactions; p public.payments;
begin
  select * into t from private.payment_provider_transactions where id=target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into p from public.payments where id=t.payment_id for update;
  if p.status<>'PENDING' or p.method<>'CREDIT_CARD' or p.payment_channel<>'HOSTED_CHECKOUT'
    or p.provider<>'ASAAS' or supplied_external_reference<>t.external_reference
    or checkout_amount is null or checkout_amount<>p.amount then raise exception 'CHECKOUT_RECONCILIATION_MISMATCH'; end if;
  if t.provider_checkout_id is not null and t.provider_checkout_id<>checkout_id then raise exception 'CHECKOUT_ID_MISMATCH'; end if;
  update private.payment_provider_transactions set state='PENDING',provider_checkout_id=checkout_id,
    provider_status=checkout_status,hosted_payment_url=checkout_link,
    provider_amount=checkout_amount,expires_at=expiration,updated_at=clock_timestamp()
  where id=t.id;
end $$;

create or replace function private.process_asaas_webhook(
  event_id text,event_type text,external_payment_id text,external_status text,
  reported_amount numeric,safe_payload jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare event_row_id bigint; t private.payment_provider_transactions; p public.payments;
begin
  insert into private.payment_provider_events(provider,provider_event_id,event_type,provider_payment_id,provider_status,processing_status,sanitized_payload)
  values('ASAAS',event_id,event_type,external_payment_id,external_status,'RECEIVED',coalesce(safe_payload,'{}'::jsonb))
  on conflict(provider,provider_event_id) do nothing returning id into event_row_id;
  if event_row_id is null then return jsonb_build_object('result','duplicate'); end if;
  select * into t from private.payment_provider_transactions where provider='ASAAS' and provider_payment_id=external_payment_id for update;
  if not found then
    update private.payment_provider_events set processing_status='IGNORED',processed_at=clock_timestamp() where id=event_row_id;
    return jsonb_build_object('result','unknown');
  end if;
  select * into p from public.payments where id=t.payment_id for update;
  update private.payment_provider_events set payment_id=p.id where id=event_row_id;
  if event_type in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED') then
    if reported_amount is null or reported_amount<>p.amount then
      update private.payment_provider_transactions set state='RECONCILIATION_FAILED',provider_status=external_status,
        failure_code='PROVIDER_AMOUNT_MISMATCH',updated_at=clock_timestamp() where id=t.id;
      update private.payment_provider_events set processing_status='REVIEW',processed_at=clock_timestamp() where id=event_row_id;
      perform private.mark_payment_subject_review(p.id,'PROVIDER_AMOUNT_MISMATCH');
      return jsonb_build_object('result','review');
    end if;
    -- Credit becomes operationally paid on CONFIRMED; PIX on RECEIVED.
    if (p.method='CREDIT_CARD' and event_type='PAYMENT_CONFIRMED') or event_type='PAYMENT_RECEIVED' then
      perform private.mark_payment_subject_paid(p.id,event_type='PAYMENT_RECEIVED');
      update private.payment_provider_transactions set state='PAID',provider_status=external_status,
        confirmed_at=coalesce(confirmed_at,clock_timestamp()),updated_at=clock_timestamp() where id=t.id;
    else
      update private.payment_provider_transactions set provider_status=external_status,updated_at=clock_timestamp() where id=t.id;
    end if;
  elsif event_type in ('PAYMENT_OVERDUE','PAYMENT_DELETED') then
    update public.payments set status='CANCELLED' where id=p.id and status='PENDING';
    update private.payment_provider_transactions set state=case when event_type='PAYMENT_OVERDUE' then 'EXPIRED' else 'CANCELLED' end,
      provider_status=external_status,updated_at=clock_timestamp() where id=t.id;
  else
    update private.payment_provider_transactions set provider_status=external_status,updated_at=clock_timestamp() where id=t.id;
  end if;
  update private.payment_provider_events set processing_status='PROCESSED',processed_at=clock_timestamp() where id=event_row_id;
  insert into public.audit_logs(unit_id,action,metadata) values
    (p.unit_id,'provider.webhook.received',jsonb_build_object('payment_id',p.id,'event_type',event_type,'subject',p.payment_subject_type));
  return jsonb_build_object('result','processed','paymentStatus',(select status from public.payments where id=p.id));
end $$;

create or replace function private.process_asaas_checkout_payment_webhook(
  target_event_id text,target_event_type text,external_payment_id text,external_checkout_id text,
  external_status text,reported_amount numeric,target_billing_type text,
  supplied_external_reference text,safe_payload jsonb
) returns text language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare t private.payment_provider_transactions; p public.payments; event_state text;
begin
  insert into private.payment_provider_events(provider,provider_event_id,event_type,provider_payment_id,provider_status,processing_status,sanitized_payload)
  values('ASAAS',target_event_id,target_event_type,external_payment_id,external_status,'RECEIVED',coalesce(safe_payload,'{}'::jsonb))
  on conflict(provider,provider_event_id) do nothing;
  select processing_status into event_state from private.payment_provider_events
   where provider='ASAAS' and provider_event_id=target_event_id for update;
  if event_state='PROCESSED' then return 'DUPLICATE'; end if;
  select * into t from private.payment_provider_transactions
   where provider='ASAAS' and provider_checkout_id=external_checkout_id for update;
  if not found then
    update private.payment_provider_events set processing_status='IGNORED',processed_at=clock_timestamp()
     where provider='ASAAS' and provider_event_id=target_event_id; return 'UNKNOWN';
  end if;
  select * into p from public.payments where id=t.payment_id for update;
  if p.method<>'CREDIT_CARD' or p.payment_channel<>'HOSTED_CHECKOUT' or p.provider<>'ASAAS'
    or target_billing_type<>'CREDIT_CARD' or supplied_external_reference<>t.external_reference
    or reported_amount is null or reported_amount<>p.amount
    or (t.provider_payment_id is not null and t.provider_payment_id<>external_payment_id) then
    update private.payment_provider_transactions set state='RECONCILIATION_FAILED',
      failure_code='CHECKOUT_PAYMENT_RECONCILIATION_MISMATCH',updated_at=clock_timestamp() where id=t.id;
    update private.payment_provider_events set processing_status='REVIEW',payment_id=p.id,processed_at=clock_timestamp()
     where provider='ASAAS' and provider_event_id=target_event_id;
    perform private.mark_payment_subject_review(p.id,'CHECKOUT_PAYMENT_RECONCILIATION_MISMATCH'); return 'REVIEW';
  end if;
  update private.payment_provider_transactions set provider_payment_id=external_payment_id,
    provider_status=external_status,provider_amount=reported_amount,updated_at=clock_timestamp() where id=t.id;
  update public.payments set provider_reference=external_payment_id where id=p.id;
  update private.payment_provider_events set payment_id=p.id where provider='ASAAS' and provider_event_id=target_event_id;
  if target_event_type='PAYMENT_CONFIRMED' then
    perform private.mark_payment_subject_paid(p.id,false);
    update private.payment_provider_transactions set state='PAID',confirmed_at=coalesce(confirmed_at,clock_timestamp()),
      updated_at=clock_timestamp() where id=t.id;
  end if;
  update private.payment_provider_events set processing_status='PROCESSED',processed_at=clock_timestamp()
   where provider='ASAAS' and provider_event_id=target_event_id;
  return 'PROCESSED';
end $$;

-- Checkout-session events are also subject-aware. The callback remains
-- non-financial; only this authenticated provider webhook may confirm payment.
create or replace function private.process_asaas_checkout_webhook(
  target_event_id text,target_event_type text,target_checkout_id text,
  target_checkout_status text,supplied_external_reference text,safe_payload jsonb
) returns text language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare t private.payment_provider_transactions; p public.payments; event_state text;
begin
  insert into private.payment_provider_events(
    provider,provider_event_id,event_type,provider_payment_id,
    provider_status,processing_status,sanitized_payload
  ) values(
    'ASAAS',target_event_id,target_event_type,target_checkout_id,
    target_checkout_status,'RECEIVED',coalesce(safe_payload,'{}'::jsonb)
  ) on conflict(provider,provider_event_id) do nothing;
  select processing_status into event_state from private.payment_provider_events
   where provider='ASAAS' and provider_event_id=target_event_id for update;
  if event_state='PROCESSED' then return 'DUPLICATE'; end if;

  select * into t from private.payment_provider_transactions
   where provider='ASAAS' and provider_checkout_id=target_checkout_id for update;
  if not found or t.external_reference is distinct from supplied_external_reference then
    update private.payment_provider_events set processing_status='REVIEW',processed_at=clock_timestamp()
     where provider='ASAAS' and provider_event_id=target_event_id;
    return 'REVIEW';
  end if;

  select * into p from public.payments where id=t.payment_id for update;
  update private.payment_provider_events set payment_id=p.id
   where provider='ASAAS' and provider_event_id=target_event_id;

  if target_event_type='CHECKOUT_PAID' then
    if p.status='PENDING' and t.state='PENDING' then
      perform private.mark_payment_subject_paid(p.id,false);
      update private.payment_provider_transactions set state='PAID',provider_status=target_checkout_status,
        confirmed_at=coalesce(confirmed_at,clock_timestamp()),updated_at=clock_timestamp() where id=t.id;
    elsif p.status<>'PAID' or t.state<>'PAID' then
      update private.payment_provider_events set processing_status='REVIEW',processed_at=clock_timestamp()
       where provider='ASAAS' and provider_event_id=target_event_id;
      return 'REVIEW';
    end if;
  elsif target_event_type in ('CHECKOUT_EXPIRED','CHECKOUT_CANCELED') then
    update public.payments set status=case when target_event_type='CHECKOUT_EXPIRED' then 'FAILED' else 'CANCELLED' end
     where id=p.id and status='PENDING';
    update private.payment_provider_transactions set
      state=case when target_event_type='CHECKOUT_EXPIRED' then 'EXPIRED' else 'CANCELLED' end,
      provider_status=target_checkout_status,updated_at=clock_timestamp()
     where id=t.id and state<>'PAID';
  end if;
  update private.payment_provider_events set processing_status='PROCESSED',processed_at=clock_timestamp()
   where provider='ASAAS' and provider_event_id=target_event_id;
  return 'PROCESSED';
end $$;

-- Service-role helper used by the generalized webhook after provider-specific
-- reconciliation. It never accepts a browser supplied subject or amount.
create or replace function public.confirm_provider_payment_subject(payment_id uuid,settled boolean default false)
returns void language sql security definer
set search_path=pg_catalog,private as $$select private.mark_payment_subject_paid(payment_id,settled)$$;

revoke all on function private.customer_owns_monthly_billing_period(uuid),
  private.authorize_monthly_payment(uuid),private.monthly_payment_json(uuid,public.parking_payment_method),
  private.reserve_monthly_provider_payment(uuid,public.parking_payment_method,public.payment_channel,uuid),
  private.mark_payment_subject_paid(uuid,boolean),private.mark_payment_subject_review(uuid,text)
  from public,anon,authenticated;
revoke all on function public.reserve_monthly_pix_payment(uuid,uuid),
  public.reserve_monthly_credit_checkout(uuid,uuid),public.get_monthly_provider_payment(uuid,public.parking_payment_method),
  public.record_monthly_cash_payment(uuid,uuid),public.confirm_provider_payment_subject(uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.reserve_monthly_pix_payment(uuid,uuid),
  public.reserve_monthly_credit_checkout(uuid,uuid),public.get_monthly_provider_payment(uuid,public.parking_payment_method),
  public.record_monthly_cash_payment(uuid,uuid) to authenticated;
grant execute on function public.confirm_provider_payment_subject(uuid,boolean) to service_role;

-- Close historical private entry points that already have public wrappers.
revoke execute on function private.record_manual_payment(uuid,public.parking_payment_method,uuid),
  private.reserve_pix_payment(uuid,uuid),private.reserve_credit_checkout(uuid,uuid)
  from public,anon,authenticated;
