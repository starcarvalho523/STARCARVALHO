alter type public.payment_channel add value if not exists 'TOKENIZED_CHECKOUT';

create table private.efi_card_payment_references (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  provider_charge_id text not null unique,
  provider_status text not null,
  installments smallint not null check (installments = 1),
  brand text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  paid_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.efi_card_payment_references enable row level security;
revoke all on private.efi_card_payment_references from public, anon, authenticated;

create or replace function private.authorize_efi_card_session(target_session uuid)
returns public.parking_sessions language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare session_row public.parking_sessions;
begin
  select * into session_row from public.parking_sessions where id=target_session;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  if not (private.customer_owns_session(target_session) or private.has_unit_role(session_row.unit_id,array['owner','manager','operator']::public.app_role[])) then
    raise exception 'PAYMENT_FORBIDDEN' using errcode='42501';
  end if;
  if not exists(select 1 from public.payment_method_availability a where a.unit_id=session_row.unit_id and a.payment_method='CREDIT_CARD' and a.payment_channel='TOKENIZED_CHECKOUT' and a.payment_provider='EFI' and a.enabled and a.configuration_state='READY') then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE';
  end if;
  return session_row;
end $$;
revoke all on function private.authorize_efi_card_session(uuid) from public,anon,authenticated;

create or replace function public.get_or_reserve_efi_card_payment(target_session uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; existing_payment uuid; current_provider text; new_payment uuid:=gen_random_uuid();
begin
  s:=private.authorize_efi_card_session(target_session);
  perform pg_advisory_xact_lock(hashtextextended(target_session::text,0));
  select id into existing_payment from public.payments where parking_session_id=target_session and provider='EFI' and method='CREDIT_CARD' and status='PENDING' order by created_at desc limit 1 for update;
  if existing_payment is not null then return existing_payment; end if;
  select provider into current_provider from public.payments where parking_session_id=target_session and status in ('PENDING','PAID') order by created_at desc limit 1 for update;
  if current_provider is not null then raise exception 'EFI_PAYMENT_PROVIDER_CONFLICT' using errcode='22023'; end if;
  if s.status<>'PAYMENT_PENDING' or s.payment_status<>'PENDING' or s.final_amount is null or s.final_amount<=0 then raise exception 'EFI_PAYMENT_NOT_READY' using errcode='22023'; end if;
  insert into public.payments(id,unit_id,parking_session_id,amount,method,status,provider,provider_environment,payment_channel,operational_status,settlement_status,gross_amount,manual_confirmation,idempotency_key)
  values(new_payment,s.unit_id,s.id,s.final_amount,'CREDIT_CARD','PENDING','EFI','SANDBOX','TOKENIZED_CHECKOUT','PENDING','PENDING',s.final_amount,false,gen_random_uuid());
  return new_payment;
end $$;
revoke all on function public.get_or_reserve_efi_card_payment(uuid) from public,anon,authenticated;
grant execute on function public.get_or_reserve_efi_card_payment(uuid) to authenticated;

create or replace function private.get_efi_card_payment_context(target_payment uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare p public.payments; r private.efi_card_payment_references;
begin
 select * into p from public.payments where id=target_payment;
 if not found or p.provider<>'EFI' or p.method<>'CREDIT_CARD' or p.payment_channel<>'TOKENIZED_CHECKOUT' or p.provider_environment<>'SANDBOX' then raise exception 'EFI_CARD_PAYMENT_INVALID' using errcode='22023'; end if;
 select * into r from private.efi_card_payment_references where payment_id=p.id;
 return jsonb_build_object('paymentId',p.id,'status',p.status,'amountCents',(p.amount*100)::bigint,'chargeId',r.provider_charge_id,'providerStatus',r.provider_status);
end $$;
create or replace function private.reserve_efi_card_reference(target_payment uuid,target_charge_id text,target_status text,target_brand text,target_last4 text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare r private.efi_card_payment_references;
begin
 perform 1 from public.payments where id=target_payment and provider='EFI' and method='CREDIT_CARD' and status='PENDING' for update;
 if not found then raise exception 'EFI_CARD_PAYMENT_INVALID' using errcode='22023'; end if;
 select * into r from private.efi_card_payment_references where payment_id=target_payment for update;
 if found then if r.provider_charge_id<>target_charge_id then raise exception 'EFI_CARD_REFERENCE_EXISTS' using errcode='23505'; end if; return jsonb_build_object('result','existing'); end if;
 insert into private.efi_card_payment_references(payment_id,provider_charge_id,provider_status,installments,brand,last4) values(target_payment,target_charge_id,target_status,1,target_brand,target_last4);
 return jsonb_build_object('result','reserved');
end $$;
revoke all on function private.get_efi_card_payment_context(uuid),private.reserve_efi_card_reference(uuid,text,text,text,text) from public,anon,authenticated;
