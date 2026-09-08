create or replace function private.mark_efi_card_creation_failure(target_payment uuid, target_state text, target_stage text, target_provider_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
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

    if target_state in ('FAILED_BEFORE_PROVIDER','REJECTED') then
      update public.payments
      set status='FAILED', operational_status='FAILED', settlement_status='FAILED'
      where id=target_payment
        and status='PENDING'
        and provider='EFI'
        and method='CREDIT_CARD'
        and payment_channel='TOKENIZED_CHECKOUT';
    end if;

    return jsonb_build_object('result','marked','state',target_state);
  end if;

  return jsonb_build_object('result','unchanged','state',a.state);
end $function$;

update public.payments p
set status='FAILED', operational_status='FAILED', settlement_status='FAILED'
from private.efi_card_creation_attempts a
where a.payment_id=p.id
  and a.state in ('FAILED_BEFORE_PROVIDER','REJECTED')
  and p.status='PENDING'
  and p.provider='EFI'
  and p.method='CREDIT_CARD'
  and p.payment_channel='TOKENIZED_CHECKOUT'
  and p.provider_reference is null;
