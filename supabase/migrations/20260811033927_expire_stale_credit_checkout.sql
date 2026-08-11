-- Expire hosted credit checkouts using the server-side timestamp before a
-- replacement can be reserved. The advisory lock in reserve_credit_checkout
-- serializes expiry and replacement for each parking session.
create or replace function private.expire_stale_credit_checkout(target_session uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  expired_count integer := 0;
  target_unit uuid;
begin
  select s.unit_id
    into target_unit
    from public.parking_sessions s
   where s.id = target_session;

  with expired_transactions as (
    update private.payment_provider_transactions t
       set state = 'EXPIRED',
           provider_status = 'EXPIRED',
           failure_code = 'CHECKOUT_EXPIRED',
           failure_description = 'Hosted checkout validity elapsed',
           updated_at = clock_timestamp()
      from public.payments p
     where p.id = t.payment_id
       and p.parking_session_id = target_session
       and p.method = 'CREDIT_CARD'
       and p.payment_channel = 'HOSTED_CHECKOUT'
       and p.provider = 'ASAAS'
       and p.status = 'PENDING'
       and t.state = 'PENDING'
       and t.expires_at is not null
       and t.expires_at <= clock_timestamp()
    returning p.id
  )
  update public.payments p
     set status = 'FAILED'
   where p.id in (select id from expired_transactions);

  get diagnostics expired_count = row_count;

  if expired_count > 0 then
    insert into public.audit_logs(unit_id, action, metadata)
    values (
      target_unit,
      'provider.credit_checkout.expired',
      jsonb_build_object('session_id', target_session, 'count', expired_count)
    );
  end if;

  return expired_count;
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
begin
  s := private.authorize_credit_checkout(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text, 0));

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
    transaction_id, payment_id, 'ASAAS', 'SANDBOX', 'CREATING',
    'starcarvalhos:checkout:' || md5(payment_id::text)
  );

  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
  values (
    auth.uid(), s.unit_id, 'provider.credit_checkout.reserved',
    jsonb_build_object('payment_id', payment_id, 'session_id', s.id, 'environment', 'SANDBOX')
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

-- A delayed PAID webhook for a locally expired checkout must not settle the
-- old payment or the session after a replacement checkout was reserved.
create or replace function private.process_asaas_checkout_webhook(
  target_event_id text,
  target_event_type text,
  target_checkout_id text,
  target_checkout_status text,
  supplied_external_reference text,
  safe_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  t private.payment_provider_transactions;
  p public.payments;
  s public.parking_sessions;
begin
  insert into private.payment_provider_events(
    provider, provider_event_id, event_type, provider_payment_id,
    provider_status, processing_status, sanitized_payload
  ) values (
    'ASAAS', target_event_id, target_event_type, target_checkout_id,
    target_checkout_status, 'RECEIVED', safe_payload
  ) on conflict(provider, provider_event_id) do nothing;

  if not found then
    return 'DUPLICATE';
  end if;

  select * into t
    from private.payment_provider_transactions
   where provider = 'ASAAS'
     and provider_payment_id = target_checkout_id
   for update;

  if not found or t.external_reference is distinct from supplied_external_reference then
    update private.payment_provider_events
       set processing_status = 'REVIEW', processed_at = clock_timestamp()
     where provider = 'ASAAS' and provider_event_id = target_event_id;
    return 'REVIEW';
  end if;

  select * into p from public.payments where id = t.payment_id for update;
  select * into s from public.parking_sessions where id = p.parking_session_id for update;

  if target_event_type = 'CHECKOUT_PAID' then
    if p.status <> 'PENDING'
       or t.state <> 'PENDING'
       or s.status <> 'PAYMENT_PENDING'
       or s.payment_status <> 'PENDING' then
      update private.payment_provider_events
         set processing_status = 'REVIEW', payment_id = p.id,
             processed_at = clock_timestamp()
       where provider = 'ASAAS' and provider_event_id = target_event_id;
      return 'REVIEW';
    end if;

    update public.payments
       set status = 'PAID', operational_status = 'APPROVED',
           settlement_status = 'UNKNOWN', paid_at = clock_timestamp(),
           fee_amount = null, net_amount = null
     where id = p.id;
    update private.payment_provider_transactions
       set state = 'PAID', provider_status = target_checkout_status,
           confirmed_at = clock_timestamp(), updated_at = clock_timestamp()
     where id = t.id;
    update public.parking_sessions
       set status = 'PAID', payment_status = 'PAID', updated_at = clock_timestamp()
     where id = s.id;
  elsif target_event_type in ('CHECKOUT_EXPIRED', 'CHECKOUT_CANCELED') then
    update public.payments
       set status = case when target_event_type = 'CHECKOUT_EXPIRED' then 'FAILED' else 'CANCELLED' end
     where id = p.id and status = 'PENDING';
    update private.payment_provider_transactions
       set state = case when target_event_type = 'CHECKOUT_EXPIRED' then 'EXPIRED' else 'CANCELLED' end,
           provider_status = target_checkout_status,
           updated_at = clock_timestamp()
     where id = t.id and state <> 'PAID';
  end if;

  update private.payment_provider_events
     set processing_status = 'PROCESSED', payment_id = p.id,
         processed_at = clock_timestamp()
   where provider = 'ASAAS' and provider_event_id = target_event_id;
  return 'PROCESSED';
end
$$;

alter function private.expire_stale_credit_checkout(uuid) owner to postgres;
alter function private.reserve_credit_checkout(uuid, uuid) owner to postgres;
alter function private.process_asaas_checkout_webhook(text, text, text, text, text, jsonb) owner to postgres;

revoke all on function private.expire_stale_credit_checkout(uuid)
  from public, anon, authenticated;
revoke all on function private.reserve_credit_checkout(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.process_asaas_checkout_webhook(text, text, text, text, text, jsonb)
  from public, anon, authenticated;

