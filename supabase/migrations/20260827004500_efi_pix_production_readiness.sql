create or replace function private.get_efi_pix_payment_context(target_payment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $$
declare
  p public.payments;
  r private.efi_pix_payment_references;
begin
  select * into p from public.payments where id=target_payment;
  if not found then raise exception 'EFI_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI' or p.method<>'PIX' or p.payment_channel<>'QR' then
    raise exception 'EFI_PROVIDER_MISMATCH' using errcode='22023';
  end if;
  select * into r from private.efi_pix_payment_references where payment_id=p.id;
  return jsonb_build_object(
    'paymentId',p.id,
    'status',p.status,
    'amountCents',(p.amount*100)::bigint,
    'providerEnvironment',p.provider_environment,
    'txid',r.txid,
    'locationId',r.location_id,
    'providerStatus',r.provider_status
  );
end $$;

create or replace function public.get_or_reserve_efi_pix_payment_for_environment(
  target_session uuid,
  target_environment text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  s public.parking_sessions;
  existing_payment uuid;
  current_payment public.payments;
  new_payment uuid:=gen_random_uuid();
begin
  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_ENVIRONMENT_INVALID' using errcode='22023';
  end if;

  s:=private.authorize_efi_pix_session(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text,0));

  select p.id into existing_payment
  from public.payments p
  where p.parking_session_id=target_session
    and p.provider='EFI'
    and p.method='PIX'
    and p.payment_channel='QR'
    and p.provider_environment=target_environment
    and p.status='PENDING'
  order by p.created_at desc
  limit 1
  for update;

  if existing_payment is not null then return existing_payment; end if;

  select p.* into current_payment
  from public.payments p
  where p.parking_session_id=target_session
    and p.status in ('PENDING','PAID')
  order by p.created_at desc
  limit 1
  for update;

  if found then
    raise exception 'EFI_PAYMENT_PROVIDER_CONFLICT' using errcode='22023';
  end if;

  if s.status<>'PAYMENT_PENDING'
     or s.payment_status<>'PENDING'
     or s.final_amount is null
     or s.final_amount<=0 then
    raise exception 'EFI_PAYMENT_NOT_READY' using errcode='22023';
  end if;

  insert into public.payments(
    id,unit_id,parking_session_id,amount,method,status,provider,
    provider_environment,payment_channel,operational_status,
    settlement_status,gross_amount,manual_confirmation,idempotency_key
  ) values(
    new_payment,s.unit_id,s.id,s.final_amount,'PIX','PENDING','EFI',
    target_environment,'QR','PENDING','PENDING',s.final_amount,false,gen_random_uuid()
  );

  return new_payment;
end $$;

create or replace function public.get_or_reserve_efi_pix_payment(target_session uuid)
returns uuid
language sql
security definer
set search_path=pg_catalog,public,private
as $$
  select public.get_or_reserve_efi_pix_payment_for_environment(target_session,'SANDBOX');
$$;

create or replace function public.get_efi_pix_payment_for_session_for_environment(
  target_session uuid,
  target_environment text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare result uuid;
begin
  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_ENVIRONMENT_INVALID' using errcode='22023';
  end if;
  perform private.authorize_efi_pix_session(target_session);
  select p.id into result
  from public.payments p
  where p.parking_session_id=target_session
    and p.provider='EFI'
    and p.method='PIX'
    and p.payment_channel='QR'
    and p.provider_environment=target_environment
  order by p.created_at desc
  limit 1;
  if result is null then raise exception 'PIX_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end $$;

create or replace function public.get_efi_pix_payment_for_session(target_session uuid)
returns uuid
language sql
security definer
set search_path=pg_catalog,public,private
as $$
  select public.get_efi_pix_payment_for_session_for_environment(target_session,'SANDBOX');
$$;

create or replace function private.process_efi_pix_webhook(
  event_key text,
  event_txid text,
  event_end_to_end_id text,
  event_amount_cents bigint,
  event_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  event_id bigint;
  ref private.efi_pix_payment_references;
  payment public.payments;
begin
  insert into private.efi_pix_webhook_events(
    idempotency_key,txid,end_to_end_id,amount_cents,paid_at,processing_status
  ) values(
    event_key,event_txid,event_end_to_end_id,event_amount_cents,event_paid_at,'RECEIVED'
  )
  on conflict(idempotency_key) do nothing
  returning id into event_id;

  if event_id is null then return jsonb_build_object('result','duplicate'); end if;

  select * into ref
  from private.efi_pix_payment_references
  where txid=event_txid
  for update;

  if not found then
    update private.efi_pix_webhook_events
      set processing_status='IGNORED',processed_at=clock_timestamp()
      where id=event_id;
    return jsonb_build_object('result','unknown');
  end if;

  select * into payment from public.payments where id=ref.payment_id for update;
  update private.efi_pix_webhook_events set payment_id=payment.id where id=event_id;

  if ref.expected_amount_cents<>event_amount_cents then
    update private.efi_pix_webhook_events
      set processing_status='REVIEW',processed_at=clock_timestamp()
      where id=event_id;
    return jsonb_build_object('result','review');
  end if;

  if payment.provider<>'EFI' or payment.method<>'PIX' or payment.payment_channel<>'QR' then
    update private.efi_pix_webhook_events
      set processing_status='REVIEW',processed_at=clock_timestamp()
      where id=event_id;
    return jsonb_build_object('result','provider_mismatch');
  end if;

  if payment.status='PAID' then
    update private.efi_pix_webhook_events
      set processing_status='PROCESSED',processed_at=clock_timestamp()
      where id=event_id;
    return jsonb_build_object('result','already_paid');
  end if;

  if payment.status<>'PENDING' then
    update private.efi_pix_webhook_events
      set processing_status='REVIEW',processed_at=clock_timestamp()
      where id=event_id;
    return jsonb_build_object('result','review');
  end if;

  update public.payments
    set paid_at=coalesce(paid_at,event_paid_at)
    where id=payment.id;

  perform private.mark_payment_subject_paid(payment.id,true);

  update private.efi_pix_payment_references
    set provider_status='CONCLUIDA',paid_at=event_paid_at,
        end_to_end_id=event_end_to_end_id,updated_at=clock_timestamp()
    where payment_id=payment.id;

  update private.efi_pix_webhook_events
    set processing_status='PROCESSED',processed_at=clock_timestamp()
    where id=event_id;

  return jsonb_build_object('result','processed');
end $$;

revoke all on function private.get_efi_pix_payment_context(uuid) from public,anon,authenticated;
revoke all on function private.process_efi_pix_webhook(text,text,text,bigint,timestamptz) from public,anon,authenticated;

revoke all on function public.get_or_reserve_efi_pix_payment_for_environment(uuid,text) from public,anon;
grant execute on function public.get_or_reserve_efi_pix_payment_for_environment(uuid,text) to authenticated;
revoke all on function public.get_efi_pix_payment_for_session_for_environment(uuid,text) from public,anon;
grant execute on function public.get_efi_pix_payment_for_session_for_environment(uuid,text) to authenticated;
