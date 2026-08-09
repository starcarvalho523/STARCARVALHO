-- Payment provider foundation. External financial operations remain sandbox-only.
create table private.payment_provider_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  provider text not null check (provider = 'ASAAS'),
  environment text not null check (environment = 'SANDBOX'),
  state text not null check (state in ('CREATING','PENDING','PAID','EXPIRED','CANCELLED','CREATE_FAILED','RECONCILIATION_FAILED')),
  provider_payment_id text,
  provider_customer_id text,
  provider_status text,
  external_reference text not null unique,
  hosted_payment_url text,
  qr_code_payload text,
  qr_code_image_base64 text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table private.payment_provider_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider = 'ASAAS'),
  provider_event_id text not null,
  event_type text not null,
  provider_payment_id text,
  payment_id uuid references public.payments(id) on delete set null,
  provider_status text,
  processing_status text not null check (processing_status in ('RECEIVED','PROCESSED','DUPLICATE','IGNORED','REVIEW')),
  sanitized_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index payment_provider_transactions_state_idx
  on private.payment_provider_transactions(state, expires_at);
create index payment_provider_events_payment_idx
  on private.payment_provider_events(payment_id, received_at desc)
  where payment_id is not null;

alter table private.payment_provider_transactions enable row level security;
alter table private.payment_provider_events enable row level security;
revoke all on private.payment_provider_transactions, private.payment_provider_events from public, anon, authenticated;

create or replace function private.provider_payment_json(target_session uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'paymentId', p.id,
    'transactionId', t.id,
    'state', t.state,
    'providerStatus', t.provider_status,
    'qrCodePayload', t.qr_code_payload,
    'qrCodeImageBase64', t.qr_code_image_base64,
    'expiresAt', t.expires_at,
    'hostedPaymentUrl', t.hosted_payment_url,
    'amount', p.amount,
    'isCreator', false
  )
  from public.payments p
  join private.payment_provider_transactions t on t.payment_id = p.id
  where p.parking_session_id = target_session
    and p.method = 'PIX'
    and p.status in ('PENDING','PAID')
    and t.state in ('CREATING','PENDING','PAID')
  order by t.created_at desc
  limit 1
$$;

create or replace function private.authorize_provider_payment(target_session uuid)
returns public.parking_sessions
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.parking_sessions;
begin
  select * into session_row from public.parking_sessions where id = target_session;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (
    private.customer_owns_session(target_session)
    or private.has_unit_role(session_row.unit_id, array['owner','manager','operator']::public.app_role[])
  ) then
    raise exception 'PAYMENT_FORBIDDEN' using errcode = '42501';
  end if;
  return session_row;
end
$$;

create or replace function private.reserve_pix_payment(target_session uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.parking_sessions;
  existing jsonb;
  payment_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
begin
  session_row := private.authorize_provider_payment(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text, 0));
  select private.provider_payment_json(target_session) into existing;
  if existing is not null then return existing; end if;
  select * into session_row from public.parking_sessions where id = target_session for update;
  if session_row.status <> 'PAYMENT_PENDING' or session_row.payment_status <> 'PENDING' or session_row.final_amount is null then
    raise exception 'PAYMENT_NOT_READY';
  end if;
  if session_row.final_amount <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;

  insert into public.payments(id, unit_id, parking_session_id, amount, method, status, provider, manual_confirmation, idempotency_key)
  values(payment_id, session_row.unit_id, session_row.id, session_row.final_amount, 'PIX', 'PENDING', 'ASAAS', false, request_key);
  insert into private.payment_provider_transactions(id, payment_id, provider, environment, state, external_reference)
  values(transaction_id, payment_id, 'ASAAS', 'SANDBOX', 'CREATING', 'starcarvalhos:parking:' || payment_id::text);
  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
  values(auth.uid(), session_row.unit_id, 'provider.pix.reserved', jsonb_build_object('payment_id', payment_id, 'session_id', session_row.id, 'environment', 'SANDBOX'));
  return jsonb_build_object('paymentId',payment_id,'transactionId',transaction_id,'state','CREATING','amount',session_row.final_amount,'isCreator',true);
exception
  when unique_violation then
    select private.provider_payment_json(target_session) into existing;
    if existing is not null then return existing; end if;
    raise;
end
$$;

create or replace function public.reserve_pix_payment(session_id uuid, request_key uuid)
returns jsonb language sql volatile security invoker
set search_path = pg_catalog, private
as $$ select private.reserve_pix_payment(session_id, request_key) $$;

create or replace function private.get_provider_payment(target_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.authorize_provider_payment(target_session);
  return private.provider_payment_json(target_session);
end
$$;

create or replace function public.get_provider_payment(session_id uuid)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, private
as $$ select private.get_provider_payment(session_id) $$;

create or replace function private.mark_provider_payment_created(
  target_transaction uuid,
  external_payment_id text,
  external_customer_id text,
  external_status text,
  invoice_url text,
  pix_payload text,
  pix_image text,
  expiration timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare transaction_row private.payment_provider_transactions;
begin
  select * into transaction_row from private.payment_provider_transactions where id=target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  if transaction_row.state <> 'CREATING' then return; end if;
  update private.payment_provider_transactions set
    state='PENDING', provider_payment_id=external_payment_id, provider_customer_id=external_customer_id,
    provider_status=external_status, hosted_payment_url=invoice_url, qr_code_payload=pix_payload,
    qr_code_image_base64=pix_image, expires_at=expiration, updated_at=clock_timestamp()
  where id=target_transaction;
  update public.payments set provider_reference=external_payment_id where id=transaction_row.payment_id;
  insert into public.audit_logs(unit_id,action,metadata)
  select p.unit_id,'provider.pix.created',jsonb_build_object('payment_id',p.id,'provider','ASAAS','environment','SANDBOX')
  from public.payments p where p.id=transaction_row.payment_id;
end
$$;

create or replace function public.mark_provider_payment_created(
  transaction_id uuid, provider_payment_id text, provider_customer_id text, provider_status text,
  hosted_payment_url text, qr_code_payload text, qr_code_image_base64 text, expires_at timestamptz
)
returns void language sql volatile security invoker set search_path=pg_catalog,private
as $$ select private.mark_provider_payment_created(transaction_id,provider_payment_id,provider_customer_id,provider_status,hosted_payment_url,qr_code_payload,qr_code_image_base64,expires_at) $$;

create or replace function private.mark_provider_payment_failed(target_transaction uuid, error_code text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare payment_row public.payments;
begin
  update private.payment_provider_transactions set state='CREATE_FAILED',failure_code=left(error_code,100),updated_at=clock_timestamp()
  where id=target_transaction and state='CREATING';
  select p.* into payment_row
  from public.payments p join private.payment_provider_transactions t on t.payment_id=p.id
  where t.id=target_transaction;
  if found then
    update public.payments set status='FAILED' where id=payment_row.id and status='PENDING';
    insert into public.audit_logs(unit_id,action,metadata) values(payment_row.unit_id,'provider.pix.create_failed',jsonb_build_object('payment_id',payment_row.id,'provider','ASAAS'));
  end if;
end
$$;

create or replace function public.mark_provider_payment_failed(transaction_id uuid, error_code text)
returns void language sql volatile security invoker set search_path=pg_catalog,private
as $$ select private.mark_provider_payment_failed(transaction_id,error_code) $$;

create or replace function private.process_asaas_webhook(
  event_id text, event_type text, external_payment_id text, external_status text,
  reported_amount numeric, safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  event_row_id bigint;
  transaction_row private.payment_provider_transactions;
  payment_row public.payments;
  session_row public.parking_sessions;
begin
  insert into private.payment_provider_events(provider,provider_event_id,event_type,provider_payment_id,provider_status,processing_status,sanitized_payload)
  values('ASAAS',event_id,event_type,external_payment_id,external_status,'RECEIVED',coalesce(safe_payload,'{}'::jsonb))
  on conflict(provider,provider_event_id) do nothing returning id into event_row_id;
  if event_row_id is null then return jsonb_build_object('result','duplicate'); end if;

  select * into transaction_row from private.payment_provider_transactions
  where provider='ASAAS' and provider_payment_id=external_payment_id for update;
  if not found then
    update private.payment_provider_events set processing_status='IGNORED',processed_at=clock_timestamp() where id=event_row_id;
    insert into public.audit_logs(action,metadata) values('provider.webhook.unknown',jsonb_build_object('provider','ASAAS','event_type',event_type));
    return jsonb_build_object('result','unknown');
  end if;
  select * into payment_row from public.payments where id=transaction_row.payment_id for update;
  select * into session_row from public.parking_sessions where id=payment_row.parking_session_id for update;
  update private.payment_provider_events set payment_id=payment_row.id where id=event_row_id;

  if event_type='PAYMENT_RECEIVED' then
    if reported_amount is null or reported_amount <> payment_row.amount then
      update private.payment_provider_transactions set state='RECONCILIATION_FAILED',provider_status=external_status,updated_at=clock_timestamp() where id=transaction_row.id;
      update private.payment_provider_events set processing_status='REVIEW',processed_at=clock_timestamp() where id=event_row_id;
      update public.parking_sessions set status='MANUAL_REVIEW',updated_at=clock_timestamp() where id=session_row.id and status='PAYMENT_PENDING';
      insert into public.audit_logs(unit_id,action,metadata) values(payment_row.unit_id,'provider.reconciliation.failed',jsonb_build_object('payment_id',payment_row.id,'expected',payment_row.amount,'reported',reported_amount));
      return jsonb_build_object('result','review');
    end if;
    if payment_row.status <> 'PAID' then
      update public.payments set status='PAID',paid_at=clock_timestamp() where id=payment_row.id and status='PENDING';
      update public.parking_sessions set status='PAID',payment_status='PAID',updated_at=clock_timestamp() where id=session_row.id and status='PAYMENT_PENDING';
      update private.payment_provider_transactions set state='PAID',provider_status=external_status,confirmed_at=clock_timestamp(),updated_at=clock_timestamp() where id=transaction_row.id;
      insert into public.audit_logs(unit_id,action,metadata) values(payment_row.unit_id,'payment.confirmed',jsonb_build_object('payment_id',payment_row.id,'provider','ASAAS','method','PIX'));
    end if;
  elsif event_type in ('PAYMENT_OVERDUE','PAYMENT_DELETED') then
    update public.payments set status='CANCELLED' where id=payment_row.id and status='PENDING';
    update private.payment_provider_transactions set state=case when event_type='PAYMENT_OVERDUE' then 'EXPIRED' else 'CANCELLED' end,provider_status=external_status,updated_at=clock_timestamp() where id=transaction_row.id;
    insert into public.audit_logs(unit_id,action,metadata) values(payment_row.unit_id,'provider.charge.expired',jsonb_build_object('payment_id',payment_row.id,'event_type',event_type));
  else
    update private.payment_provider_transactions set provider_status=external_status,updated_at=clock_timestamp() where id=transaction_row.id;
  end if;
  update private.payment_provider_events set processing_status='PROCESSED',processed_at=clock_timestamp() where id=event_row_id;
  insert into public.audit_logs(unit_id,action,metadata) values(payment_row.unit_id,'provider.webhook.received',jsonb_build_object('payment_id',payment_row.id,'event_type',event_type,'provider','ASAAS'));
  return jsonb_build_object('result','processed','sessionStatus',(select status from public.parking_sessions where id=session_row.id));
end
$$;

create or replace function public.process_asaas_webhook(
  event_id text, event_type text, provider_payment_id text, provider_status text,
  reported_amount numeric, sanitized_payload jsonb
)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,private
as $$ select private.process_asaas_webhook(event_id,event_type,provider_payment_id,provider_status,reported_amount,sanitized_payload) $$;

revoke all on function private.provider_payment_json(uuid),private.authorize_provider_payment(uuid),private.reserve_pix_payment(uuid,uuid),private.get_provider_payment(uuid),
  private.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz),private.mark_provider_payment_failed(uuid,text),private.process_asaas_webhook(text,text,text,text,numeric,jsonb)
  from public,anon,authenticated;
revoke all on function public.reserve_pix_payment(uuid,uuid),public.get_provider_payment(uuid),
  public.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz),public.mark_provider_payment_failed(uuid,text),public.process_asaas_webhook(text,text,text,text,numeric,jsonb)
  from public,anon,authenticated;
grant execute on function public.reserve_pix_payment(uuid,uuid),public.get_provider_payment(uuid) to authenticated;
grant execute on function public.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz),public.mark_provider_payment_failed(uuid,text),public.process_asaas_webhook(text,text,text,text,numeric,jsonb) to service_role;
