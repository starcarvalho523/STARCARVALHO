-- DB_INTEGRATION_TESTS_PENDING=true until the local Supabase stack is available.
-- Execute after `supabase db reset`; this file deliberately contains no real Efí data.
begin;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'efi_pix_webhook_events_idempotency_key_key') then
    raise exception 'missing unique idempotency constraint';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='private' and indexname='efi_pix_webhook_events_txid_idx') then
    raise exception 'missing txid lookup index';
  end if;
  if has_table_privilege('anon', 'private.efi_pix_payment_references', 'select')
     or has_table_privilege('authenticated', 'private.efi_pix_webhook_events', 'select') then
    raise exception 'private Efí tables must not be exposed';
  end if;
  if has_function_privilege('anon', 'private.process_efi_pix_webhook(text,text,text,bigint,timestamp with time zone)', 'execute') then
    raise exception 'private settlement function must not be public';
  end if;
end $$;

-- Functional fixture requirements (kept as comments so this test never invents a payment/session):
-- 1. insert an EFI PENDING payment and one matching private.efi_pix_payment_references row.
-- 2. call private.process_efi_pix_webhook() once and assert payments.status = PAID.
-- 3. call it again with the same efi:pix:<endToEndId> and assert `duplicate` and no extra event.
-- 4. assert unknown txid -> `unknown`, amount mismatch -> `review`, other provider -> `provider_mismatch`.
-- 5. assert the linked parking_sessions row remains unchanged (in particular, never EXITED).

rollback;
