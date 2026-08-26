create or replace function private.process_efi_card_settlement(
  target_charge_id text,target_custom_id text,target_amount_cents bigint,target_provider_status text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare r private.efi_card_payment_references; p public.payments; expected_amount_cents bigint;
begin
  select * into r from private.efi_card_payment_references where provider_charge_id=target_charge_id for update;
  if not found then return jsonb_build_object('result','unknown'); end if;

  select * into p from public.payments where id=r.payment_id for update;
  if not found or p.provider<>'EFI' or p.method<>'CREDIT_CARD' or p.payment_channel<>'TOKENIZED_CHECKOUT' or p.provider_environment<>'SANDBOX' then
    return jsonb_build_object('result','review');
  end if;

  expected_amount_cents:=(p.amount*100)::bigint;
  if target_custom_id is null or target_custom_id<>p.id::text then return jsonb_build_object('result','review'); end if;
  if target_amount_cents is null or target_amount_cents<>expected_amount_cents then return jsonb_build_object('result','review'); end if;

  if p.status='PAID' then
    update private.efi_card_payment_references set provider_status=target_provider_status,updated_at=clock_timestamp() where payment_id=p.id;
    return jsonb_build_object('result','already_paid');
  end if;
  if p.status<>'PENDING' then return jsonb_build_object('result','review'); end if;

  update private.efi_card_payment_references set provider_status=target_provider_status,updated_at=clock_timestamp() where payment_id=p.id;

  if target_provider_status='PAID' then
    -- The existing payments_sync_financial_dimensions BEFORE trigger maps non-CASH/PIX PAID
    -- rows to settlement_status=UNKNOWN. Set PAID first, then SETTLED in a separate update
    -- so authoritative Efí card settlement is preserved.
    update public.payments
      set status='PAID',operational_status='APPROVED',paid_at=clock_timestamp()
      where id=p.id;
    update public.payments
      set settlement_status='SETTLED'
      where id=p.id;
    update private.efi_card_payment_references set paid_at=clock_timestamp(),updated_at=clock_timestamp() where payment_id=p.id;
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

revoke all on function private.process_efi_card_settlement(text,text,bigint,text) from public,anon,authenticated;
