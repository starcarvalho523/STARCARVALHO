alter table private.efi_pix_webhook_events
  add column if not exists fee_cents bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'efi_pix_webhook_events_fee_cents_check'
      and conrelid = 'private.efi_pix_webhook_events'::regclass
  ) then
    alter table private.efi_pix_webhook_events
      add constraint efi_pix_webhook_events_fee_cents_check
      check (fee_cents is null or fee_cents >= 0);
  end if;
end $$;

create or replace function private.enrich_efi_pix_payment_financials(
  event_txid text,
  event_end_to_end_id text,
  event_amount_cents bigint,
  event_fee_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  ref private.efi_pix_payment_references;
  payment public.payments;
begin
  if event_amount_cents <= 0 then
    raise exception 'EFI_INVALID_AMOUNT' using errcode='22023';
  end if;
  if event_fee_cents is not null and (event_fee_cents < 0 or event_fee_cents > event_amount_cents) then
    raise exception 'EFI_INVALID_FEE' using errcode='22023';
  end if;

  select * into ref
  from private.efi_pix_payment_references
  where txid = event_txid
  for update;
  if not found then return jsonb_build_object('result','unknown'); end if;

  select * into payment
  from public.payments
  where id = ref.payment_id
  for update;
  if not found then return jsonb_build_object('result','unknown'); end if;

  if ref.expected_amount_cents <> event_amount_cents then
    return jsonb_build_object('result','review');
  end if;
  if payment.provider <> 'EFI' or payment.method <> 'PIX' or payment.payment_channel <> 'QR' then
    return jsonb_build_object('result','provider_mismatch');
  end if;
  if payment.provider_reference is not null and payment.provider_reference <> event_end_to_end_id then
    return jsonb_build_object('result','review');
  end if;

  update public.payments
  set provider_reference = coalesce(provider_reference, event_end_to_end_id),
      gross_amount = event_amount_cents::numeric / 100,
      fee_amount = case when event_fee_cents is not null then event_fee_cents::numeric / 100 else fee_amount end,
      net_amount = case when event_fee_cents is not null then (event_amount_cents - event_fee_cents)::numeric / 100 else net_amount end
  where id = payment.id;

  update private.efi_pix_payment_references
  set end_to_end_id = coalesce(end_to_end_id, event_end_to_end_id),
      updated_at = clock_timestamp()
  where payment_id = payment.id;

  update private.efi_pix_webhook_events
  set fee_cents = coalesce(fee_cents, event_fee_cents)
  where end_to_end_id = event_end_to_end_id;

  return jsonb_build_object('result','enriched');
end $$;

create or replace function public.enrich_efi_pix_payment_financials(
  event_txid text,
  event_end_to_end_id text,
  event_amount_cents bigint,
  event_fee_cents bigint
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.enrich_efi_pix_payment_financials(
    event_txid,
    event_end_to_end_id,
    event_amount_cents,
    event_fee_cents
  );
$$;

revoke all on function private.enrich_efi_pix_payment_financials(text,text,bigint,bigint) from public, anon, authenticated, service_role;
revoke all on function public.enrich_efi_pix_payment_financials(text,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.enrich_efi_pix_payment_financials(text,text,bigint,bigint) to service_role;

create or replace function private.process_efi_pix_webhook(event_key text, event_txid text, event_end_to_end_id text, event_amount_cents bigint, event_paid_at timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
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
    update public.payments
      set provider_reference=coalesce(provider_reference,event_end_to_end_id),
          gross_amount=coalesce(gross_amount,event_amount_cents::numeric/100)
      where id=payment.id;
    update private.efi_pix_payment_references
      set end_to_end_id=coalesce(end_to_end_id,event_end_to_end_id),
          paid_at=coalesce(paid_at,event_paid_at),updated_at=clock_timestamp()
      where payment_id=payment.id;
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

  update public.payments
    set provider_reference=coalesce(provider_reference,event_end_to_end_id),
        gross_amount=coalesce(gross_amount,event_amount_cents::numeric/100)
    where id=payment.id;

  update private.efi_pix_payment_references
    set provider_status='CONCLUIDA',paid_at=event_paid_at,
        end_to_end_id=event_end_to_end_id,updated_at=clock_timestamp()
    where payment_id=payment.id;

  update private.efi_pix_webhook_events
    set processing_status='PROCESSED',processed_at=clock_timestamp()
    where id=event_id;

  return jsonb_build_object('result','processed');
end $$;

update public.payments p
set provider_reference = r.end_to_end_id,
    gross_amount = coalesce(p.gross_amount,p.amount)
from private.efi_pix_payment_references r
where p.id = r.payment_id
  and p.provider='EFI'
  and p.method='PIX'
  and p.payment_channel='QR'
  and p.status='PAID'
  and r.end_to_end_id is not null
  and p.provider_reference is null;
