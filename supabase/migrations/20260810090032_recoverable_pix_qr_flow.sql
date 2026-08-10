-- Preserve external Asaas charges before QR retrieval and make QR failures retryable.
alter table private.payment_provider_transactions
  add column provider_amount numeric(12,2),
  add column failure_description text;

alter table private.payment_provider_transactions
  drop constraint payment_provider_transactions_state_check;
alter table private.payment_provider_transactions
  add constraint payment_provider_transactions_state_check
  check (state in ('CREATING','RECONCILING','PROVIDER_CREATED','QR_FETCHING','QR_PENDING','PENDING','PAID','EXPIRED','CANCELLED','CREATE_FAILED','RECONCILIATION_FAILED'));

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
    and p.status in ('PENDING','PAID','FAILED')
    and t.state in ('CREATING','RECONCILING','PROVIDER_CREATED','QR_FETCHING','QR_PENDING','PENDING','PAID','CREATE_FAILED','RECONCILIATION_FAILED')
  order by t.created_at desc
  limit 1
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
  existing_transaction private.payment_provider_transactions;
  payment_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
begin
  session_row := private.authorize_provider_payment(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text, 0));
  select private.provider_payment_json(target_session) into existing;
  if existing is not null then
    select * into existing_transaction
    from private.payment_provider_transactions
    where id=(existing->>'transactionId')::uuid
    for update;
    if existing_transaction.state in ('PROVIDER_CREATED','QR_PENDING')
      or (existing_transaction.state='QR_FETCHING' and existing_transaction.updated_at < clock_timestamp()-interval '5 minutes') then
      update private.payment_provider_transactions set state='QR_FETCHING',updated_at=clock_timestamp()
      where id=existing_transaction.id;
      return existing || jsonb_build_object('state','QR_FETCHING','isCreator',true);
    end if;
    if existing_transaction.state in ('CREATE_FAILED','RECONCILIATION_FAILED')
      or (existing_transaction.state in ('CREATING','RECONCILING') and existing_transaction.updated_at < clock_timestamp()-interval '5 minutes') then
      update private.payment_provider_transactions set state='RECONCILING',updated_at=clock_timestamp()
      where id=existing_transaction.id;
      return existing || jsonb_build_object('state','RECONCILING','isCreator',true);
    end if;
    return existing;
  end if;
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

create or replace function private.get_provider_recovery_context(target_transaction uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare transaction_row private.payment_provider_transactions; payment_row public.payments;
begin
  select * into transaction_row from private.payment_provider_transactions where id=target_transaction;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into payment_row from public.payments where id=transaction_row.payment_id;
  return jsonb_build_object(
    'transactionId',transaction_row.id,
    'state',transaction_row.state,
    'externalReference',transaction_row.external_reference,
    'providerPaymentId',transaction_row.provider_payment_id,
    'providerCustomerId',transaction_row.provider_customer_id,
    'providerStatus',transaction_row.provider_status,
    'providerAmount',transaction_row.provider_amount,
    'hostedPaymentUrl',transaction_row.hosted_payment_url,
    'amount',payment_row.amount
  );
end
$$;

create or replace function public.get_provider_recovery_context(transaction_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private
as $$ select private.get_provider_recovery_context(transaction_id) $$;

create or replace function private.mark_provider_external_created(
  target_transaction uuid, external_payment_id text, external_customer_id text,
  external_status text, external_amount numeric, supplied_external_reference text, invoice_url text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare transaction_row private.payment_provider_transactions; payment_row public.payments; session_row public.parking_sessions;
begin
  select * into transaction_row from private.payment_provider_transactions where id=target_transaction for update;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into payment_row from public.payments where id=transaction_row.payment_id for update;
  select * into session_row from public.parking_sessions where id=payment_row.parking_session_id for update;
  if session_row.status <> 'PAYMENT_PENDING' or session_row.payment_status <> 'PENDING' then raise exception 'PAYMENT_NOT_READY'; end if;
  if external_payment_id is null or supplied_external_reference <> transaction_row.external_reference then raise exception 'PROVIDER_REFERENCE_MISMATCH'; end if;
  if external_amount is null or external_amount <> payment_row.amount then raise exception 'PROVIDER_AMOUNT_MISMATCH'; end if;
  update private.payment_provider_transactions set
    state='PROVIDER_CREATED',provider_payment_id=external_payment_id,provider_customer_id=external_customer_id,
    provider_status=external_status,provider_amount=external_amount,hosted_payment_url=invoice_url,
    failure_code=null,failure_description=null,updated_at=clock_timestamp()
  where id=target_transaction;
  update public.payments set status='PENDING',provider_reference=external_payment_id where id=payment_row.id;
  insert into public.audit_logs(unit_id,action,metadata)
  values(payment_row.unit_id,'provider.pix.external_persisted',jsonb_build_object('payment_id',payment_row.id,'provider','ASAAS','environment','SANDBOX'));
end
$$;

create or replace function public.mark_provider_external_created(
  transaction_id uuid, provider_payment_id text, provider_customer_id text,
  provider_status text, provider_amount numeric, external_reference text, hosted_payment_url text
)
returns void language sql volatile security definer set search_path=pg_catalog,private
as $$ select private.mark_provider_external_created(transaction_id,provider_payment_id,provider_customer_id,provider_status,provider_amount,external_reference,hosted_payment_url) $$;

create or replace function private.mark_provider_pix_qr_ready(target_transaction uuid,pix_payload text,pix_image text,expiration timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $$
begin
  update private.payment_provider_transactions set state='PENDING',qr_code_payload=pix_payload,qr_code_image_base64=pix_image,
    expires_at=expiration,failure_code=null,failure_description=null,updated_at=clock_timestamp()
  where id=target_transaction and provider_payment_id is not null and state in ('PROVIDER_CREATED','QR_FETCHING','QR_PENDING','PENDING');
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_RECOVERABLE'; end if;
end
$$;

create or replace function public.mark_provider_pix_qr_ready(transaction_id uuid,qr_code_payload text,qr_code_image_base64 text,expires_at timestamptz)
returns void language sql volatile security definer set search_path=pg_catalog,private
as $$ select private.mark_provider_pix_qr_ready(transaction_id,qr_code_payload,qr_code_image_base64,expires_at) $$;

create or replace function private.mark_provider_pix_qr_pending(target_transaction uuid,error_code text,error_description text)
returns void language plpgsql security definer set search_path=pg_catalog,private
as $$
begin
  update private.payment_provider_transactions set state='QR_PENDING',failure_code=left(error_code,100),
    failure_description=left(error_description,160),updated_at=clock_timestamp()
  where id=target_transaction and provider_payment_id is not null and state in ('PROVIDER_CREATED','QR_FETCHING','QR_PENDING','PENDING');
end
$$;

create or replace function public.mark_provider_pix_qr_pending(transaction_id uuid,error_code text,error_description text)
returns void language sql volatile security definer set search_path=pg_catalog,private
as $$ select private.mark_provider_pix_qr_pending(transaction_id,error_code,error_description) $$;

create or replace function private.mark_provider_reconciliation_pending(target_transaction uuid,error_code text,error_description text)
returns void language plpgsql security definer set search_path=pg_catalog,private
as $$
begin
  update private.payment_provider_transactions set state='RECONCILIATION_FAILED',failure_code=left(error_code,100),
    failure_description=left(error_description,160),updated_at=clock_timestamp()
  where id=target_transaction and provider_payment_id is null and state in ('CREATING','RECONCILING','CREATE_FAILED','RECONCILIATION_FAILED');
end
$$;

create or replace function public.mark_provider_reconciliation_pending(transaction_id uuid,error_code text,error_description text)
returns void language sql volatile security definer set search_path=pg_catalog,private
as $$ select private.mark_provider_reconciliation_pending(transaction_id,error_code,error_description) $$;

create or replace function private.mark_provider_manual_review(target_transaction uuid,reason_code text)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare payment_row public.payments;
begin
  select p.* into payment_row from public.payments p join private.payment_provider_transactions t on t.payment_id=p.id where t.id=target_transaction;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  update private.payment_provider_transactions set state='RECONCILIATION_FAILED',failure_code=left(reason_code,100),updated_at=clock_timestamp() where id=target_transaction;
  update public.parking_sessions set status='MANUAL_REVIEW',updated_at=clock_timestamp()
  where id=payment_row.parking_session_id and status='PAYMENT_PENDING';
end
$$;

create or replace function public.mark_provider_manual_review(transaction_id uuid,reason_code text)
returns void language sql volatile security definer set search_path=pg_catalog,private
as $$ select private.mark_provider_manual_review(transaction_id,reason_code) $$;

revoke all on function private.get_provider_recovery_context(uuid),
  private.mark_provider_external_created(uuid,text,text,text,numeric,text,text),
  private.mark_provider_pix_qr_ready(uuid,text,text,timestamptz),
  private.mark_provider_pix_qr_pending(uuid,text,text),
  private.mark_provider_reconciliation_pending(uuid,text,text),
  private.mark_provider_manual_review(uuid,text)
  from public,anon,authenticated;
revoke all on function public.get_provider_recovery_context(uuid),
  public.mark_provider_external_created(uuid,text,text,text,numeric,text,text),
  public.mark_provider_pix_qr_ready(uuid,text,text,timestamptz),
  public.mark_provider_pix_qr_pending(uuid,text,text),
  public.mark_provider_reconciliation_pending(uuid,text,text),
  public.mark_provider_manual_review(uuid,text)
  from public,anon,authenticated;
grant execute on function private.get_provider_recovery_context(uuid),
  private.mark_provider_external_created(uuid,text,text,text,numeric,text,text),
  private.mark_provider_pix_qr_ready(uuid,text,text,timestamptz),
  private.mark_provider_pix_qr_pending(uuid,text,text),
  private.mark_provider_reconciliation_pending(uuid,text,text),
  private.mark_provider_manual_review(uuid,text)
  to service_role;
grant execute on function public.get_provider_recovery_context(uuid),
  public.mark_provider_external_created(uuid,text,text,text,numeric,text,text),
  public.mark_provider_pix_qr_ready(uuid,text,text,timestamptz),
  public.mark_provider_pix_qr_pending(uuid,text,text),
  public.mark_provider_reconciliation_pending(uuid,text,text),
  public.mark_provider_manual_review(uuid,text)
  to service_role;

