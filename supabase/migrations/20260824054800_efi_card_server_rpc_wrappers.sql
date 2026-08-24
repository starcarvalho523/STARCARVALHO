create or replace function public.get_efi_card_payment_context(target_payment uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.get_efi_card_payment_context(target_payment);
$$;

create or replace function public.claim_efi_card_creation(target_payment uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.claim_efi_card_creation(target_payment);
$$;

create or replace function public.complete_efi_card_creation(
  target_payment uuid,
  target_charge_id text,
  target_status text,
  target_brand text,
  target_last4 text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.complete_efi_card_creation(
    target_payment,
    target_charge_id,
    target_status,
    target_brand,
    target_last4
  );
$$;

create or replace function public.mark_efi_card_creation_failure(
  target_payment uuid,
  target_state text,
  target_stage text,
  target_provider_code text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.mark_efi_card_creation_failure(
    target_payment,
    target_state,
    target_stage,
    target_provider_code
  );
$$;

create or replace function public.process_efi_card_settlement(
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
  select private.process_efi_card_settlement(
    target_charge_id,
    target_custom_id,
    target_amount_cents,
    target_provider_status
  );
$$;

revoke all on function public.get_efi_card_payment_context(uuid) from public, anon, authenticated;
revoke all on function public.claim_efi_card_creation(uuid) from public, anon, authenticated;
revoke all on function public.complete_efi_card_creation(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mark_efi_card_creation_failure(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.process_efi_card_settlement(text,text,bigint,text) from public, anon, authenticated;

grant execute on function public.get_efi_card_payment_context(uuid) to service_role;
grant execute on function public.claim_efi_card_creation(uuid) to service_role;
grant execute on function public.complete_efi_card_creation(uuid,text,text,text,text) to service_role;
grant execute on function public.mark_efi_card_creation_failure(uuid,text,text,text) to service_role;
grant execute on function public.process_efi_card_settlement(text,text,bigint,text) to service_role;