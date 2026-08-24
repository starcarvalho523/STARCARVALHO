create table private.efi_card_creation_attempts (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  state text not null check (state in ('CLAIMED','CREATED','FAILED_BEFORE_PROVIDER','REJECTED','UNCERTAIN')),
  provider_charge_id text unique,
  error_stage text,
  provider_code text,
  claimed_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (provider_code is null or provider_code ~ '^[A-Z0-9_]{1,80}$')
);

alter table private.efi_card_creation_attempts enable row level security;
revoke all on private.efi_card_creation_attempts from public, anon, authenticated;

insert into private.efi_card_creation_attempts(payment_id,state,provider_charge_id)
select payment_id,'CREATED',provider_charge_id
from private.efi_card_payment_references
on conflict (payment_id) do nothing;

create or replace function private.claim_efi_card_creation(target_payment uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  p public.payments;
  a private.efi_card_creation_attempts;
  r private.efi_card_payment_references;
  inserted_payment uuid;
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'EFI_CARD_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI' or p.method<>'CREDIT_CARD' or p.payment_channel<>'TOKENIZED_CHECKOUT' or p.provider_environment<>'SANDBOX' then
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

create or replace function private.complete_efi_card_creation(
  target_payment uuid,target_charge_id text,target_status text,target_brand text,target_last4 text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  a private.efi_card_creation_attempts;
  reserve_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_payment::text,0));
  select * into a from private.efi_card_creation_attempts where payment_id=target_payment for update;
  if not found then raise exception 'EFI_CARD_CREATION_NOT_CLAIMED' using errcode='22023'; end if;

  if a.state='CREATED' then
    if a.provider_charge_id<>target_charge_id then raise exception 'EFI_CARD_CREATION_REFERENCE_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('result','existing');
  end if;
  if a.state<>'CLAIMED' then raise exception 'EFI_CARD_CREATION_BLOCKED' using errcode='22023'; end if;

  select private.reserve_efi_card_reference(target_payment,target_charge_id,target_status,target_brand,target_last4)
  into reserve_result;

  update private.efi_card_creation_attempts
  set state='CREATED',provider_charge_id=target_charge_id,error_stage=null,provider_code=null,updated_at=clock_timestamp()
  where payment_id=target_payment;

  return jsonb_build_object('result','created','reference',reserve_result);
end $$;

create or replace function private.mark_efi_card_creation_failure(
  target_payment uuid,target_state text,target_stage text,target_provider_code text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare a private.efi_card_creation_attempts;
begin
  if target_state not in ('FAILED_BEFORE_PROVIDER','REJECTED','UNCERTAIN') then
    raise exception 'EFI_CARD_CREATION_INVALID_FAILURE_STATE' using errcode='22023';
  end if;
  if target_provider_code is not null and target_provider_code !~ '^[A-Z0-9_]{1,80}$' then
    raise exception 'EFI_CARD_CREATION_INVALID_PROVIDER_CODE' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_payment::text,0));
  select * into a from private.efi_card_creation_attempts where payment_id=target_payment for update;
  if not found then raise exception 'EFI_CARD_CREATION_NOT_CLAIMED' using errcode='22023'; end if;

  if a.state='CLAIMED' then
    update private.efi_card_creation_attempts
    set state=target_state,error_stage=left(target_stage,80),provider_code=target_provider_code,updated_at=clock_timestamp()
    where payment_id=target_payment;
    return jsonb_build_object('result','marked','state',target_state);
  end if;

  return jsonb_build_object('result','unchanged','state',a.state);
end $$;

create or replace function private.get_efi_card_payment_context(target_payment uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare
  p public.payments;
  r private.efi_card_payment_references;
  a private.efi_card_creation_attempts;
begin
  select * into p from public.payments where id=target_payment;
  if not found then raise exception 'EFI_CARD_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI' or p.method<>'CREDIT_CARD' or p.payment_channel<>'TOKENIZED_CHECKOUT' or p.provider_environment<>'SANDBOX' then
    raise exception 'EFI_CARD_PAYMENT_INVALID' using errcode='22023';
  end if;
  select * into r from private.efi_card_payment_references where payment_id=p.id;
  select * into a from private.efi_card_creation_attempts where payment_id=p.id;
  return jsonb_build_object(
    'paymentId',p.id,
    'status',p.status,
    'amountCents',(p.amount*100)::bigint,
    'chargeId',r.provider_charge_id,
    'providerStatus',r.provider_status,
    'creationState',a.state
  );
end $$;

revoke all on function private.claim_efi_card_creation(uuid) from public,anon,authenticated;
revoke all on function private.complete_efi_card_creation(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function private.mark_efi_card_creation_failure(uuid,text,text,text) from public,anon,authenticated;
revoke all on function private.get_efi_card_payment_context(uuid) from public,anon,authenticated;