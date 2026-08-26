-- Prepare Efí credit-card persistence for a future Production rollout without enabling it.
-- Production activation remains controlled by application runtime gates, dedicated
-- credentials, and payment_method_availability.enabled.

alter table private.efi_card_payment_references
  add column if not exists provider_environment text;

update private.efi_card_payment_references r
set provider_environment = p.provider_environment
from public.payments p
where p.id = r.payment_id
  and r.provider_environment is null;

alter table private.efi_card_payment_references
  alter column provider_environment set not null;

alter table private.efi_card_payment_references
  drop constraint if exists efi_card_payment_references_provider_charge_id_key;

create unique index if not exists efi_card_payment_references_environment_charge_uidx
  on private.efi_card_payment_references(provider_environment, provider_charge_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'efi_card_payment_references_environment_check'
      and conrelid = 'private.efi_card_payment_references'::regclass
  ) then
    alter table private.efi_card_payment_references
      add constraint efi_card_payment_references_environment_check
      check (provider_environment in ('SANDBOX','PRODUCTION'));
  end if;
end $$;

create or replace function private.authorize_efi_card_session_for_actor(
  target_session uuid,
  target_actor uuid
)
returns public.parking_sessions
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.parking_sessions;
begin
  if target_actor is null then
    raise exception 'PAYMENT_FORBIDDEN' using errcode='42501';
  end if;

  select * into session_row
  from public.parking_sessions
  where id = target_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode='P0002';
  end if;

  if session_row.customer_owner_id is distinct from target_actor then
    raise exception 'PAYMENT_FORBIDDEN' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.payment_method_availability a
    where a.unit_id = session_row.unit_id
      and a.payment_method = 'CREDIT_CARD'
      and a.payment_channel = 'TOKENIZED_CHECKOUT'
      and a.payment_provider = 'EFI'
      and a.enabled
      and a.configuration_state = 'READY'
  ) then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE' using errcode='22023';
  end if;

  return session_row;
end $$;

revoke all on function private.authorize_efi_card_session_for_actor(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.get_or_reserve_efi_card_payment_for_actor(
  target_session uuid,
  target_actor uuid,
  target_environment text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  s public.parking_sessions;
  existing_payment uuid;
  current_payment uuid;
  new_payment uuid := gen_random_uuid();
begin
  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_CARD_ENVIRONMENT_INVALID' using errcode='22023';
  end if;

  s := private.authorize_efi_card_session_for_actor(target_session, target_actor);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text,0));

  select p.id into existing_payment
  from public.payments p
  where p.parking_session_id = target_session
    and p.provider = 'EFI'
    and p.method = 'CREDIT_CARD'
    and p.payment_channel = 'TOKENIZED_CHECKOUT'
    and p.provider_environment = target_environment
    and p.status = 'PENDING'
  order by p.created_at desc
  limit 1
  for update;

  if existing_payment is not null then
    return existing_payment;
  end if;

  select p.id into current_payment
  from public.payments p
  where p.parking_session_id = target_session
    and p.status in ('PENDING','PAID')
  order by p.created_at desc
  limit 1
  for update;

  if current_payment is not null then
    raise exception 'EFI_PAYMENT_PROVIDER_CONFLICT' using errcode='22023';
  end if;

  if s.status <> 'PAYMENT_PENDING'
     or s.payment_status <> 'PENDING'
     or s.final_amount is null
     or s.final_amount <= 0 then
    raise exception 'EFI_PAYMENT_NOT_READY' using errcode='22023';
  end if;

  insert into public.payments(
    id, unit_id, parking_session_id, amount, method, status, provider,
    provider_environment, payment_channel, operational_status,
    settlement_status, gross_amount, manual_confirmation, idempotency_key
  ) values (
    new_payment, s.unit_id, s.id, s.final_amount, 'CREDIT_CARD', 'PENDING', 'EFI',
    target_environment, 'TOKENIZED_CHECKOUT', 'PENDING',
    'PENDING', s.final_amount, false, gen_random_uuid()
  );

  return new_payment;
end $$;

revoke all on function public.get_or_reserve_efi_card_payment_for_actor(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_or_reserve_efi_card_payment_for_actor(uuid,uuid,text)
  to service_role;

create or replace function private.get_efi_card_payment_context(target_payment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  p public.payments;
  r private.efi_card_payment_references;
  a private.efi_card_creation_attempts;
begin
  select * into p from public.payments where id=target_payment;
  if not found then raise exception 'EFI_CARD_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI'
     or p.method<>'CREDIT_CARD'
     or p.payment_channel<>'TOKENIZED_CHECKOUT'
     or p.provider_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_CARD_PAYMENT_INVALID' using errcode='22023';
  end if;

  select * into r from private.efi_card_payment_references where payment_id=p.id;
  select * into a from private.efi_card_creation_attempts where payment_id=p.id;

  return jsonb_build_object(
    'paymentId',p.id,
    'status',p.status,
    'amountCents',(p.amount*100)::bigint,
    'providerEnvironment',p.provider_environment,
    'chargeId',r.provider_charge_id,
    'providerStatus',r.provider_status,
    'creationState',a.state
  );
end $$;

create or replace function private.claim_efi_card_creation(target_payment uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  p public.payments;
  a private.efi_card_creation_attempts;
  r private.efi_card_payment_references;
  inserted_payment uuid;
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'EFI_CARD_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI'
     or p.method<>'CREDIT_CARD'
     or p.payment_channel<>'TOKENIZED_CHECKOUT'
     or p.provider_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_CARD_PAYMENT_INVALID' using errcode='22023';
  end if;
  if p.status<>'PENDING' then raise exception 'EFI_CARD_PAYMENT_NOT_PENDING' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));

  select * into r from private.efi_card_payment_references where payment_id=p.id;
  if found then
    return jsonb_build_object('result','existing','state','CREATED','chargeId',r.provider_charge_id,'providerStatus',r.provider_status);
  end if;

  insert into private.efi_card_creation_attempts(payment_id,state)
  values(p.id,'CLAIMED')
  on conflict (payment_id) do nothing
  returning payment_id into inserted_payment;

  select * into a from private.efi_card_creation_attempts where payment_id=p.id for update;
  if inserted_payment is not null then
    return jsonb_build_object('result','claimed','state',a.state);
  end if;

  return jsonb_build_object('result','blocked','state',a.state,'chargeId',a.provider_charge_id);
end $$;

create or replace function private.reserve_efi_card_reference(
  target_payment uuid,
  target_charge_id text,
  target_status text,
  target_brand text,
  target_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  p public.payments;
  r private.efi_card_payment_references;
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'EFI_CARD_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI'
     or p.method<>'CREDIT_CARD'
     or p.payment_channel<>'TOKENIZED_CHECKOUT'
     or p.provider_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_CARD_PAYMENT_INVALID' using errcode='22023';
  end if;
  if p.status<>'PENDING' then raise exception 'EFI_CARD_PAYMENT_NOT_PENDING' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));
  select * into r from private.efi_card_payment_references where payment_id=target_payment for update;

  if found then
    if r.provider_charge_id<>target_charge_id or r.provider_environment<>p.provider_environment then
      raise exception 'EFI_CARD_REFERENCE_EXISTS' using errcode='23505';
    end if;
    return jsonb_build_object('result','existing');
  end if;

  insert into private.efi_card_payment_references(
    payment_id,provider_environment,provider_charge_id,provider_status,installments,brand,last4
  ) values (
    target_payment,p.provider_environment,target_charge_id,target_status,1,target_brand,target_last4
  );

  return jsonb_build_object('result','reserved');
end $$;

create or replace function private.process_efi_card_settlement_for_environment(
  target_environment text,
  target_charge_id text,
  target_custom_id text,
  target_amount_cents bigint,
  target_provider_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  r private.efi_card_payment_references;
  p public.payments;
  expected_amount_cents bigint;
begin
  if target_environment not in ('SANDBOX','PRODUCTION') then
    return jsonb_build_object('result','review');
  end if;

  select * into r
  from private.efi_card_payment_references
  where provider_environment=target_environment
    and provider_charge_id=target_charge_id
  for update;

  if not found then return jsonb_build_object('result','unknown'); end if;

  select * into p from public.payments where id=r.payment_id for update;
  if not found
     or p.provider<>'EFI'
     or p.method<>'CREDIT_CARD'
     or p.payment_channel<>'TOKENIZED_CHECKOUT'
     or p.provider_environment<>target_environment then
    return jsonb_build_object('result','review');
  end if;

  expected_amount_cents := (p.amount*100)::bigint;
  if target_custom_id is null or target_custom_id<>p.id::text then return jsonb_build_object('result','review'); end if;
  if target_amount_cents is null or target_amount_cents<>expected_amount_cents then return jsonb_build_object('result','review'); end if;

  if p.status='PAID' then
    update private.efi_card_payment_references
      set provider_status=target_provider_status,updated_at=clock_timestamp()
      where payment_id=p.id;
    return jsonb_build_object('result','already_paid');
  end if;

  if p.status<>'PENDING' then return jsonb_build_object('result','review'); end if;

  update private.efi_card_payment_references
    set provider_status=target_provider_status,updated_at=clock_timestamp()
    where payment_id=p.id;

  if target_provider_status='PAID' then
    update public.payments
      set status='PAID',operational_status='APPROVED',paid_at=clock_timestamp()
      where id=p.id;
    update public.payments
      set settlement_status='SETTLED'
      where id=p.id;
    update private.efi_card_payment_references
      set paid_at=clock_timestamp(),updated_at=clock_timestamp()
      where payment_id=p.id;
    return jsonb_build_object('result','processed');
  end if;

  if target_provider_status='FAILED' then
    update public.payments
      set status='FAILED',operational_status='FAILED',settlement_status='FAILED'
      where id=p.id;
    return jsonb_build_object('result','processed');
  end if;

  if target_provider_status='PENDING' then return jsonb_build_object('result','pending'); end if;
  return jsonb_build_object('result','review');
end $$;

create or replace function private.process_efi_card_settlement(
  target_charge_id text,
  target_custom_id text,
  target_amount_cents bigint,
  target_provider_status text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.process_efi_card_settlement_for_environment(
    'SANDBOX',
    target_charge_id,
    target_custom_id,
    target_amount_cents,
    target_provider_status
  );
$$;

revoke all on function private.process_efi_card_settlement_for_environment(text,text,text,bigint,text)
  from public, anon, authenticated;

create or replace function public.process_efi_card_settlement_for_environment(
  target_environment text,
  target_charge_id text,
  target_custom_id text,
  target_amount_cents bigint,
  target_provider_status text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.process_efi_card_settlement_for_environment(
    target_environment,
    target_charge_id,
    target_custom_id,
    target_amount_cents,
    target_provider_status
  );
$$;

revoke all on function public.process_efi_card_settlement_for_environment(text,text,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.process_efi_card_settlement_for_environment(text,text,text,bigint,text)
  to service_role;
