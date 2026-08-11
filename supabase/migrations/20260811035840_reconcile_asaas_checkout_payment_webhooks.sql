alter table private.payment_provider_transactions
  add column provider_checkout_id text;

update private.payment_provider_transactions t
   set provider_checkout_id = t.provider_payment_id,
       provider_payment_id = null,
       updated_at = clock_timestamp()
  from public.payments p
 where p.id = t.payment_id
   and p.method = 'CREDIT_CARD'
   and p.payment_channel = 'HOSTED_CHECKOUT'
   and p.provider = 'ASAAS';

create unique index payment_provider_transactions_checkout_id_idx
  on private.payment_provider_transactions(provider, provider_checkout_id)
  where provider_checkout_id is not null;

create or replace function private.mark_credit_checkout_created(
  target_transaction uuid,
  checkout_id text,
  checkout_status text,
  checkout_link text,
  supplied_external_reference text,
  checkout_amount numeric,
  expiration timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  t private.payment_provider_transactions;
  p public.payments;
begin
  select * into t from private.payment_provider_transactions where id = target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into p from public.payments where id = t.payment_id for update;
  if p.method <> 'CREDIT_CARD'
     or p.payment_channel <> 'HOSTED_CHECKOUT'
     or p.provider <> 'ASAAS'
     or t.external_reference <> supplied_external_reference
     or p.amount <> checkout_amount then
    raise exception 'CHECKOUT_RECONCILIATION_MISMATCH';
  end if;
  if t.provider_checkout_id is not null and t.provider_checkout_id <> checkout_id then
    raise exception 'CHECKOUT_ID_IMMUTABLE';
  end if;
  update private.payment_provider_transactions
     set state = 'PENDING', provider_checkout_id = checkout_id,
         provider_status = checkout_status, provider_amount = checkout_amount,
         hosted_payment_url = checkout_link, expires_at = expiration,
         updated_at = clock_timestamp()
   where id = target_transaction;
  update public.payments set provider_reference = checkout_id where id = p.id;
end
$$;

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
  if not found then return 'DUPLICATE'; end if;

  select * into t from private.payment_provider_transactions
   where provider = 'ASAAS' and provider_checkout_id = target_checkout_id for update;
  if not found or t.external_reference is distinct from supplied_external_reference then
    update private.payment_provider_events set processing_status = 'REVIEW', processed_at = clock_timestamp()
     where provider = 'ASAAS' and provider_event_id = target_event_id;
    return 'REVIEW';
  end if;

  select * into p from public.payments where id = t.payment_id for update;
  select * into s from public.parking_sessions where id = p.parking_session_id for update;
  update private.payment_provider_events set payment_id = p.id where provider = 'ASAAS' and provider_event_id = target_event_id;

  if target_event_type = 'CHECKOUT_PAID' then
    if p.status <> 'PENDING' or t.state <> 'PENDING' or s.status <> 'PAYMENT_PENDING' or s.payment_status <> 'PENDING' then
      update private.payment_provider_events set processing_status = 'REVIEW', processed_at = clock_timestamp()
       where provider = 'ASAAS' and provider_event_id = target_event_id;
      return 'REVIEW';
    end if;
    update public.payments set status = 'PAID', operational_status = 'APPROVED', settlement_status = 'UNKNOWN',
      paid_at = clock_timestamp(), fee_amount = null, net_amount = null where id = p.id;
    update private.payment_provider_transactions set state = 'PAID', provider_status = target_checkout_status,
      confirmed_at = clock_timestamp(), updated_at = clock_timestamp() where id = t.id;
    update public.parking_sessions set status = 'PAID', payment_status = 'PAID', updated_at = clock_timestamp() where id = s.id;
  elsif target_event_type in ('CHECKOUT_EXPIRED','CHECKOUT_CANCELED') then
    update public.payments set status = case when target_event_type = 'CHECKOUT_EXPIRED' then 'FAILED' else 'CANCELLED' end
     where id = p.id and status = 'PENDING';
    update private.payment_provider_transactions set state = case when target_event_type = 'CHECKOUT_EXPIRED' then 'EXPIRED' else 'CANCELLED' end,
      provider_status = target_checkout_status, updated_at = clock_timestamp() where id = t.id and state <> 'PAID';
  end if;
  update private.payment_provider_events set processing_status = 'PROCESSED', processed_at = clock_timestamp()
   where provider = 'ASAAS' and provider_event_id = target_event_id;
  return 'PROCESSED';
end
$$;

create or replace function private.get_credit_checkout_reconciliation_candidates(reported_amount numeric)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'transactionId', t.id,
    'checkoutId', t.provider_checkout_id,
    'externalReference', t.external_reference,
    'amount', p.amount
  ) order by t.created_at), '[]'::jsonb)
  from public.payments p
  join private.payment_provider_transactions t on t.payment_id = p.id
  where p.method = 'CREDIT_CARD'
    and p.payment_channel = 'HOSTED_CHECKOUT'
    and p.provider = 'ASAAS'
    and p.status in ('PENDING','PAID')
    and t.state in ('PENDING','PAID')
    and t.provider_checkout_id is not null
    and (reported_amount is null or p.amount = reported_amount)
$$;

create or replace function public.get_credit_checkout_reconciliation_candidates(reported_amount numeric)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$ select private.get_credit_checkout_reconciliation_candidates(reported_amount) $$;

create or replace function private.mark_checkout_payment_event_review(
  target_event_id text,
  target_event_type text,
  external_payment_id text,
  external_status text,
  safe_payload jsonb,
  reason_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into private.payment_provider_events(
    provider, provider_event_id, event_type, provider_payment_id,
    provider_status, processing_status, sanitized_payload, processed_at
  ) values (
    'ASAAS', target_event_id, target_event_type, external_payment_id,
    external_status, case when reason_code = 'CHECKOUT_PAYMENT_UNKNOWN' then 'IGNORED' else 'REVIEW' end,
    coalesce(safe_payload, '{}'::jsonb), clock_timestamp()
  ) on conflict(provider, provider_event_id) do update
    set processing_status = excluded.processing_status,
        sanitized_payload = excluded.sanitized_payload,
        processed_at = excluded.processed_at
    where private.payment_provider_events.processing_status <> 'PROCESSED';
  return case when reason_code = 'CHECKOUT_PAYMENT_UNKNOWN' then 'UNKNOWN' else 'REVIEW' end;
end
$$;

create or replace function public.mark_checkout_payment_event_review(
  event_id text, event_type text, provider_payment_id text, provider_status text,
  sanitized_payload jsonb, reason_code text
)
returns text
language sql
volatile
security definer
set search_path = pg_catalog, private
as $$ select private.mark_checkout_payment_event_review(event_id,event_type,provider_payment_id,provider_status,sanitized_payload,reason_code) $$;

create or replace function private.process_asaas_checkout_payment_webhook(
  target_event_id text,
  target_event_type text,
  external_payment_id text,
  external_checkout_id text,
  external_status text,
  reported_amount numeric,
  target_billing_type text,
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
  event_state text;
begin
  insert into private.payment_provider_events(
    provider, provider_event_id, event_type, provider_payment_id,
    provider_status, processing_status, sanitized_payload
  ) values (
    'ASAAS', target_event_id, target_event_type, external_payment_id,
    external_status, 'RECEIVED', coalesce(safe_payload, '{}'::jsonb)
  ) on conflict(provider, provider_event_id) do nothing;

  select processing_status into event_state from private.payment_provider_events
   where provider = 'ASAAS' and provider_event_id = target_event_id for update;
  if event_state = 'PROCESSED' then return 'DUPLICATE'; end if;

  select * into t from private.payment_provider_transactions
   where provider = 'ASAAS' and provider_checkout_id = external_checkout_id for update;
  if not found then
    update private.payment_provider_events set processing_status = 'IGNORED', processed_at = clock_timestamp()
     where provider = 'ASAAS' and provider_event_id = target_event_id;
    return 'UNKNOWN';
  end if;
  select * into p from public.payments where id = t.payment_id for update;
  select * into s from public.parking_sessions where id = p.parking_session_id for update;

  if p.method <> 'CREDIT_CARD' or p.payment_channel <> 'HOSTED_CHECKOUT' or p.provider <> 'ASAAS'
     or target_billing_type <> 'CREDIT_CARD'
     or supplied_external_reference <> t.external_reference
     or reported_amount is null or reported_amount <> p.amount then
    update private.payment_provider_transactions set state = 'RECONCILIATION_FAILED',
      failure_code = 'CHECKOUT_PAYMENT_RECONCILIATION_MISMATCH', updated_at = clock_timestamp() where id = t.id;
    update private.payment_provider_events set processing_status = 'REVIEW', payment_id = p.id, processed_at = clock_timestamp()
     where provider = 'ASAAS' and provider_event_id = target_event_id;
    update public.parking_sessions set status = 'MANUAL_REVIEW', updated_at = clock_timestamp()
     where id = s.id and status = 'PAYMENT_PENDING';
    return 'REVIEW';
  end if;

  if t.provider_payment_id is not null and t.provider_payment_id <> external_payment_id then
    update private.payment_provider_transactions set state = 'RECONCILIATION_FAILED',
      failure_code = 'CHECKOUT_PAYMENT_ID_MISMATCH', updated_at = clock_timestamp() where id = t.id;
    update private.payment_provider_events set processing_status = 'REVIEW', payment_id = p.id, processed_at = clock_timestamp()
     where provider = 'ASAAS' and provider_event_id = target_event_id;
    update public.parking_sessions set status = 'MANUAL_REVIEW', updated_at = clock_timestamp()
     where id = s.id and status = 'PAYMENT_PENDING';
    return 'REVIEW';
  end if;

  update private.payment_provider_transactions set provider_payment_id = external_payment_id,
    provider_status = external_status, provider_amount = reported_amount, updated_at = clock_timestamp() where id = t.id;
  update public.payments set provider_reference = external_payment_id where id = p.id;
  update private.payment_provider_events set payment_id = p.id where provider = 'ASAAS' and provider_event_id = target_event_id;

  if target_event_type = 'PAYMENT_CONFIRMED' then
    if p.status = 'PENDING' and t.state = 'PENDING' and s.status = 'PAYMENT_PENDING' and s.payment_status = 'PENDING' then
      update public.payments set status = 'PAID', operational_status = 'APPROVED', settlement_status = 'UNKNOWN',
        paid_at = clock_timestamp(), fee_amount = null, net_amount = null where id = p.id;
      update private.payment_provider_transactions set state = 'PAID', confirmed_at = clock_timestamp(),
        updated_at = clock_timestamp() where id = t.id;
      update public.parking_sessions set status = 'PAID', payment_status = 'PAID', updated_at = clock_timestamp() where id = s.id;
    elsif p.status <> 'PAID' or t.state <> 'PAID' or s.status <> 'PAID' or s.payment_status <> 'PAID' then
      update private.payment_provider_events set processing_status = 'REVIEW', processed_at = clock_timestamp()
       where provider = 'ASAAS' and provider_event_id = target_event_id;
      return 'REVIEW';
    end if;
  end if;

  update private.payment_provider_events set processing_status = 'PROCESSED', processed_at = clock_timestamp()
   where provider = 'ASAAS' and provider_event_id = target_event_id;
  return 'PROCESSED';
end
$$;

create or replace function public.process_asaas_checkout_payment_webhook(
  event_id text, event_type text, provider_payment_id text, provider_checkout_id text,
  provider_status text, reported_amount numeric, billing_type text,
  external_reference text, sanitized_payload jsonb
)
returns text
language sql
volatile
security definer
set search_path = pg_catalog, private
as $$ select private.process_asaas_checkout_payment_webhook(event_id,event_type,provider_payment_id,provider_checkout_id,provider_status,reported_amount,billing_type,external_reference,sanitized_payload) $$;

alter function public.get_credit_checkout_reconciliation_candidates(numeric) owner to postgres;
alter function public.mark_checkout_payment_event_review(text,text,text,text,jsonb,text) owner to postgres;
alter function public.process_asaas_checkout_payment_webhook(text,text,text,text,text,numeric,text,text,jsonb) owner to postgres;

revoke all on function private.get_credit_checkout_reconciliation_candidates(numeric),
  private.mark_checkout_payment_event_review(text,text,text,text,jsonb,text),
  private.process_asaas_checkout_payment_webhook(text,text,text,text,text,numeric,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.get_credit_checkout_reconciliation_candidates(numeric),
  public.mark_checkout_payment_event_review(text,text,text,text,jsonb,text),
  public.process_asaas_checkout_payment_webhook(text,text,text,text,text,numeric,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.get_credit_checkout_reconciliation_candidates(numeric),
  public.mark_checkout_payment_event_review(text,text,text,text,jsonb,text),
  public.process_asaas_checkout_payment_webhook(text,text,text,text,text,numeric,text,text,jsonb)
  to service_role;

