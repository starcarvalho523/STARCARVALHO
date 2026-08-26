create or replace function public.get_efi_pix_payment_context(target_payment uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.get_efi_pix_payment_context(target_payment);
$$;

create or replace function public.reserve_efi_pix_reference(
  target_payment uuid,
  target_txid text,
  target_location_id bigint,
  target_status text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.reserve_efi_pix_reference(
    target_payment,
    target_txid,
    target_location_id,
    target_status
  );
$$;

create or replace function public.process_efi_pix_webhook(
  event_key text,
  event_txid text,
  event_end_to_end_id text,
  event_amount_cents bigint,
  event_paid_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.process_efi_pix_webhook(
    event_key,
    event_txid,
    event_end_to_end_id,
    event_amount_cents,
    event_paid_at
  );
$$;

revoke all on function public.get_efi_pix_payment_context(uuid) from public, anon, authenticated;
revoke all on function public.reserve_efi_pix_reference(uuid,text,bigint,text) from public, anon, authenticated;
revoke all on function public.process_efi_pix_webhook(text,text,text,bigint,timestamptz) from public, anon, authenticated;

grant execute on function public.get_efi_pix_payment_context(uuid) to service_role;
grant execute on function public.reserve_efi_pix_reference(uuid,text,bigint,text) to service_role;
grant execute on function public.process_efi_pix_webhook(text,text,text,bigint,timestamptz) to service_role;
