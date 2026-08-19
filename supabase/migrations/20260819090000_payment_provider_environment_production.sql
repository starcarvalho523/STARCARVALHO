-- Align provider transaction persistence with the runtime environment.
-- Production runtime was already enabled, but the legacy constraint still only allowed SANDBOX.

alter table private.payment_provider_transactions
  drop constraint if exists payment_provider_transactions_environment_check;

alter table private.payment_provider_transactions
  add constraint payment_provider_transactions_environment_check
  check (environment in ('SANDBOX','PRODUCTION'));

create or replace function private.reserve_pix_payment(target_session uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.parking_sessions;
  existing jsonb;
  existing_transaction private.payment_provider_transactions;
  payment_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
  runtime_environment text;
begin
  session_row := private.authorize_provider_payment(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text, 0));

  select environment
    into runtime_environment
    from private.payment_provider_runtime_config
   where provider = 'ASAAS';
  if not found then
    raise exception 'PROVIDER_RUNTIME_CONFIG_MISSING:ASAAS' using errcode = '55000';
  end if;

  select private.provider_payment_json(target_session) into existing;
  if existing is not null then
    select * into existing_transaction
      from private.payment_provider_transactions
     where id=(existing->>'transactionId')::uuid
     for update;
    if existing_transaction.state in ('PROVIDER_CREATED','QR_PENDING')
      or (existing_transaction.state='QR_FETCHING' and existing_transaction.updated_at < clock_timestamp()-interval '5 minutes') then
      update private.payment_provider_transactions
         set state='QR_FETCHING',updated_at=clock_timestamp()
       where id=existing_transaction.id;
      return existing || jsonb_build_object('state','QR_FETCHING','isCreator',true);
    end if;
    if existing_transaction.state in ('CREATE_FAILED','RECONCILIATION_FAILED')
      or (existing_transaction.state in ('CREATING','RECONCILING') and existing_transaction.updated_at < clock_timestamp()-interval '5 minutes') then
      update private.payment_provider_transactions
         set state='RECONCILING',updated_at=clock_timestamp()
       where id=existing_transaction.id;
      return existing || jsonb_build_object('state','RECONCILING','isCreator',true);
    end if;
    return existing;
  end if;

  select * into session_row
    from public.parking_sessions
   where id = target_session
   for update;
  if session_row.status <> 'PAYMENT_PENDING'
     or session_row.payment_status <> 'PENDING'
     or session_row.final_amount is null then
    raise exception 'PAYMENT_NOT_READY';
  end if;
  if session_row.final_amount <= 0 then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;

  insert into public.payments(id, unit_id, parking_session_id, amount, method, status, provider, manual_confirmation, idempotency_key)
  values(payment_id, session_row.unit_id, session_row.id, session_row.final_amount, 'PIX', 'PENDING', 'ASAAS', false, request_key);

  insert into private.payment_provider_transactions(id, payment_id, provider, environment, state, external_reference)
  values(transaction_id, payment_id, 'ASAAS', runtime_environment, 'CREATING', 'starcarvalhos:parking:' || payment_id::text);

  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
  values(auth.uid(), session_row.unit_id, 'provider.pix.reserved',
         jsonb_build_object('payment_id', payment_id, 'session_id', session_row.id, 'environment', runtime_environment));

  return jsonb_build_object('paymentId',payment_id,'transactionId',transaction_id,'state','CREATING','amount',session_row.final_amount,'isCreator',true);
exception
  when unique_violation then
    select private.provider_payment_json(target_session) into existing;
    if existing is not null then return existing; end if;
    raise;
end
$$;

create or replace function private.reserve_credit_checkout(target_session uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  s public.parking_sessions;
  existing jsonb;
  payment_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
  runtime_environment text;
begin
  s := private.authorize_credit_checkout(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text, 0));

  select environment
    into runtime_environment
    from private.payment_provider_runtime_config
   where provider = 'ASAAS';
  if not found then
    raise exception 'PROVIDER_RUNTIME_CONFIG_MISSING:ASAAS' using errcode = '55000';
  end if;

  select * into s
    from public.parking_sessions
   where id = target_session
   for update;

  perform private.expire_stale_credit_checkout(target_session);

  select private.credit_checkout_json(target_session) into existing;
  if existing is not null then
    return existing;
  end if;

  if s.status <> 'PAYMENT_PENDING'
     or s.payment_status <> 'PENDING'
     or s.final_amount is null
     or s.final_amount <= 0 then
    raise exception 'PAYMENT_NOT_READY';
  end if;

  insert into public.payments(
    id, unit_id, parking_session_id, amount, method, status, provider,
    payment_channel, manual_confirmation, idempotency_key
  ) values (
    payment_id, s.unit_id, s.id, s.final_amount, 'CREDIT_CARD', 'PENDING',
    'ASAAS', 'HOSTED_CHECKOUT', false, request_key
  );

  insert into private.payment_provider_transactions(
    id, payment_id, provider, environment, state, external_reference
  ) values (
    transaction_id, payment_id, 'ASAAS', runtime_environment, 'CREATING',
    'starcarvalhos:checkout:' || md5(payment_id::text)
  );

  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
  values (
    auth.uid(), s.unit_id, 'provider.credit_checkout.reserved',
    jsonb_build_object('payment_id', payment_id, 'session_id', s.id, 'environment', runtime_environment)
  );

  return jsonb_build_object(
    'paymentId', payment_id,
    'transactionId', transaction_id,
    'state', 'CREATING',
    'amount', s.final_amount,
    'isCreator', true
  );
exception
  when unique_violation then
    select private.credit_checkout_json(target_session) into existing;
    if existing is not null then
      return existing;
    end if;
    raise;
end
$$;

revoke all on function private.reserve_pix_payment(uuid,uuid) from public,anon,authenticated;
revoke all on function private.reserve_credit_checkout(uuid,uuid) from public,anon,authenticated;
