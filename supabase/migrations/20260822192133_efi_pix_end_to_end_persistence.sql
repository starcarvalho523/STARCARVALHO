-- Efí PIX persistence is private: only server-side service-role RPCs may mutate it.
create table private.efi_pix_payment_references (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  txid text not null unique check (txid ~ '^[A-Za-z0-9]{1,35}$'),
  location_id bigint check (location_id is null or location_id > 0),
  provider_status text not null,
  expected_amount_cents bigint not null check (expected_amount_cents > 0),
  paid_at timestamptz,
  end_to_end_id text unique check (end_to_end_id is null or end_to_end_id ~ '^[A-Za-z0-9]{1,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table private.efi_pix_webhook_events (
  id bigint generated always as identity primary key,
  idempotency_key text not null unique check (idempotency_key ~ '^efi:pix:[A-Za-z0-9]{1,64}$'),
  txid text not null check (txid ~ '^[A-Za-z0-9]{1,35}$'),
  end_to_end_id text not null check (end_to_end_id ~ '^[A-Za-z0-9]{1,64}$'),
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null,
  processing_status text not null check (processing_status in ('RECEIVED','PROCESSED','DUPLICATE','IGNORED','REVIEW')),
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);

create index efi_pix_payment_references_pending_idx on private.efi_pix_payment_references(provider_status) where paid_at is null;
create index efi_pix_webhook_events_txid_idx on private.efi_pix_webhook_events(txid, created_at desc);
alter table private.efi_pix_payment_references enable row level security;
alter table private.efi_pix_webhook_events enable row level security;
revoke all on private.efi_pix_payment_references, private.efi_pix_webhook_events from public, anon, authenticated;

create or replace function private.process_efi_pix_webhook(
  event_key text, event_txid text, event_end_to_end_id text, event_amount_cents bigint, event_paid_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare event_id bigint; ref private.efi_pix_payment_references; payment public.payments;
begin
  insert into private.efi_pix_webhook_events(idempotency_key,txid,end_to_end_id,amount_cents,paid_at,processing_status)
  values(event_key,event_txid,event_end_to_end_id,event_amount_cents,event_paid_at,'RECEIVED')
  on conflict(idempotency_key) do nothing returning id into event_id;
  if event_id is null then return jsonb_build_object('result','duplicate'); end if;
  select * into ref from private.efi_pix_payment_references where txid=event_txid for update;
  if not found then update private.efi_pix_webhook_events set processing_status='IGNORED',processed_at=clock_timestamp() where id=event_id; return jsonb_build_object('result','unknown'); end if;
  select * into payment from public.payments where id=ref.payment_id for update;
  update private.efi_pix_webhook_events set payment_id=payment.id where id=event_id;
  if ref.expected_amount_cents <> event_amount_cents then
    update private.efi_pix_webhook_events set processing_status='REVIEW',processed_at=clock_timestamp() where id=event_id;
    return jsonb_build_object('result','review');
  end if;
  if payment.provider <> 'EFI' then
    update private.efi_pix_webhook_events set processing_status='REVIEW',processed_at=clock_timestamp() where id=event_id;
    return jsonb_build_object('result','provider_mismatch');
  end if;
  if payment.status = 'PAID' then
    update private.efi_pix_webhook_events set processing_status='PROCESSED',processed_at=clock_timestamp() where id=event_id;
    return jsonb_build_object('result','already_paid');
  end if;
  if payment.status <> 'PENDING' then
    update private.efi_pix_webhook_events set processing_status='REVIEW',processed_at=clock_timestamp() where id=event_id;
    return jsonb_build_object('result','review');
  end if;
  update public.payments
  set status='PAID', operational_status='APPROVED', settlement_status='SETTLED', paid_at=event_paid_at
  where id=payment.id;
  update private.efi_pix_payment_references set provider_status='CONCLUIDA',paid_at=event_paid_at,end_to_end_id=event_end_to_end_id,updated_at=clock_timestamp() where payment_id=payment.id;
  update private.efi_pix_webhook_events set processing_status='PROCESSED',processed_at=clock_timestamp() where id=event_id;
  return jsonb_build_object('result',case when payment.status='PAID' then 'already_paid' else 'processed' end);
end $$;

revoke all on function private.process_efi_pix_webhook(text,text,text,bigint,timestamptz) from public, anon, authenticated;

create or replace function private.get_efi_pix_payment_context(target_payment uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, private
as $$
declare p public.payments; r private.efi_pix_payment_references;
begin
  select * into p from public.payments where id=target_payment;
  if not found then raise exception 'EFI_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider <> 'EFI' then raise exception 'EFI_PROVIDER_MISMATCH' using errcode='22023'; end if;
  select * into r from private.efi_pix_payment_references where payment_id=p.id;
  return jsonb_build_object('paymentId',p.id,'status',p.status,'amountCents',(p.amount*100)::bigint,'txid',r.txid,'locationId',r.location_id,'providerStatus',r.provider_status);
end $$;

create or replace function private.reserve_efi_pix_reference(target_payment uuid, target_txid text, target_location_id bigint, target_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare p public.payments; r private.efi_pix_payment_references;
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'EFI_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider <> 'EFI' then raise exception 'EFI_PROVIDER_MISMATCH' using errcode='22023'; end if;
  if p.status <> 'PENDING' then raise exception 'EFI_PAYMENT_NOT_PENDING' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p.id::text, 0));
  select * into r from private.efi_pix_payment_references where payment_id=p.id for update;
  if found then
    if r.txid <> target_txid then raise exception 'EFI_REFERENCE_ALREADY_RESERVED' using errcode='23505'; end if;
    return jsonb_build_object('result','existing','txid',r.txid,'locationId',r.location_id);
  end if;
  insert into private.efi_pix_payment_references(payment_id,txid,location_id,provider_status,expected_amount_cents)
  values(p.id,target_txid,target_location_id,target_status,(p.amount*100)::bigint);
  return jsonb_build_object('result','reserved','txid',target_txid,'locationId',target_location_id);
end $$;

revoke all on function private.get_efi_pix_payment_context(uuid), private.reserve_efi_pix_reference(uuid,text,bigint,text) from public, anon, authenticated;

create or replace function private.authorize_efi_pix_session(target_session uuid)
returns public.parking_sessions language plpgsql stable security definer set search_path=pg_catalog,public,private
as $$
declare session_row public.parking_sessions;
begin
  select * into session_row from public.parking_sessions where id=target_session;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  if not (private.customer_owns_session(target_session) or private.has_unit_role(session_row.unit_id,array['owner','manager','operator']::public.app_role[])) then
    raise exception 'PAYMENT_FORBIDDEN' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.payment_method_availability a
    where a.unit_id=session_row.unit_id and a.payment_method='PIX' and a.payment_channel='QR'
      and a.payment_provider='EFI' and a.enabled and a.configuration_state='READY'
  ) then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
  return session_row;
end $$;
revoke all on function private.authorize_efi_pix_session(uuid) from public,anon,authenticated;

create or replace function public.authorize_efi_pix_payment(target_payment uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare p public.payments;
begin
  select * into p from public.payments where id=target_payment;
  if not found then raise exception 'EFI_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider <> 'EFI' then raise exception 'EFI_PROVIDER_MISMATCH' using errcode='22023'; end if;
  perform private.authorize_efi_pix_session(p.parking_session_id);
end $$;
revoke all on function public.authorize_efi_pix_payment(uuid) from public, anon, authenticated;
grant execute on function public.authorize_efi_pix_payment(uuid) to authenticated;

create or replace function public.get_or_reserve_efi_pix_payment(target_session uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare s public.parking_sessions; existing_payment uuid; current_provider text; new_payment uuid := gen_random_uuid();
begin
  s := private.authorize_efi_pix_session(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text, 0));
  select p.id into existing_payment from public.payments p
  where p.parking_session_id=target_session and p.provider='EFI' and p.method='PIX' and p.status='PENDING'
  order by p.created_at desc limit 1 for update;
  if existing_payment is not null then return existing_payment; end if;
  select p.provider into current_provider from public.payments p
  where p.parking_session_id=target_session and p.status in ('PENDING','PAID')
  order by p.created_at desc limit 1 for update;
  if current_provider is not null then raise exception 'EFI_PAYMENT_PROVIDER_CONFLICT' using errcode='22023'; end if;
  if s.status <> 'PAYMENT_PENDING' or s.payment_status <> 'PENDING' or s.final_amount is null or s.final_amount <= 0 then
    raise exception 'EFI_PAYMENT_NOT_READY' using errcode='22023';
  end if;
  insert into public.payments(
    id,unit_id,parking_session_id,amount,method,status,provider,provider_environment,
    payment_channel,operational_status,settlement_status,gross_amount,manual_confirmation,idempotency_key
  ) values(
    new_payment,s.unit_id,s.id,s.final_amount,'PIX','PENDING','EFI','SANDBOX',
    'QR','PENDING','PENDING',s.final_amount,false,gen_random_uuid()
  );
  return new_payment;
end $$;
revoke all on function public.get_or_reserve_efi_pix_payment(uuid) from public, anon, authenticated;
grant execute on function public.get_or_reserve_efi_pix_payment(uuid) to authenticated;

create or replace function public.get_efi_pix_payment_for_session(target_session uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare result uuid;
begin
  perform private.authorize_efi_pix_session(target_session);
  select p.id into result from public.payments p where p.parking_session_id=target_session and p.provider='EFI' and p.method='PIX'
  order by p.created_at desc limit 1;
  if result is null then raise exception 'PIX_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end $$;
revoke all on function public.get_efi_pix_payment_for_session(uuid) from public, anon, authenticated;
grant execute on function public.get_efi_pix_payment_for_session(uuid) to authenticated;
