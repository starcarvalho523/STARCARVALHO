-- Avulso Efí: habilita cartão tokenizado já configurado, expõe a expiração
-- operacional do PIX em 5 minutos e permite o backend encerrar uma tentativa PIX
-- antes da troca segura para cartão.

update public.payment_method_availability
set enabled = true,
    updated_at = clock_timestamp()
where payment_method = 'CREDIT_CARD'
  and payment_channel = 'TOKENIZED_CHECKOUT'
  and payment_provider = 'EFI'
  and configuration_state = 'READY';

create or replace function private.get_efi_pix_payment_context(target_payment uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  p public.payments;
  r private.efi_pix_payment_references;
begin
  select * into p from public.payments where id=target_payment;
  if not found then raise exception 'EFI_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI' or p.method<>'PIX' or p.payment_channel<>'QR' then
    raise exception 'EFI_PROVIDER_MISMATCH' using errcode='22023';
  end if;
  select * into r from private.efi_pix_payment_references where payment_id=p.id;
  return jsonb_build_object(
    'paymentId',p.id,
    'status',p.status,
    'amountCents',(p.amount*100)::bigint,
    'providerEnvironment',p.provider_environment,
    'txid',r.txid,
    'locationId',r.location_id,
    'providerStatus',r.provider_status,
    'expiresAt',case when r.created_at is null then null else r.created_at + interval '5 minutes' end
  );
end
$$;

create or replace function public.get_efi_pix_payment_context(target_payment uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','public','private'
as $$
  select private.get_efi_pix_payment_context(target_payment);
$$;

create or replace function public.finalize_efi_pix_cancellation(target_payment uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  p public.payments;
begin
  select * into p from public.payments where id=target_payment for update;
  if not found then raise exception 'EFI_PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if p.provider<>'EFI' or p.method<>'PIX' or p.payment_channel<>'QR' then
    raise exception 'EFI_PROVIDER_MISMATCH' using errcode='22023';
  end if;
  if p.status='PAID' then raise exception 'EFI_PAYMENT_ALREADY_PAID' using errcode='22023'; end if;
  if p.status='CANCELLED' then return jsonb_build_object('result','already_cancelled'); end if;
  if p.status<>'PENDING' then raise exception 'EFI_PAYMENT_NOT_PENDING' using errcode='22023'; end if;

  update public.payments
  set status='CANCELLED',
      operational_status='CANCELLED',
      settlement_status='CANCELLED'
  where id=p.id;

  update private.efi_pix_payment_references
  set provider_status='REMOVIDA_PELO_USUARIO_RECEBEDOR',
      updated_at=clock_timestamp()
  where payment_id=p.id;

  return jsonb_build_object('result','cancelled','paymentId',p.id);
end
$$;

revoke all on function public.finalize_efi_pix_cancellation(uuid) from public, anon, authenticated;
grant execute on function public.finalize_efi_pix_cancellation(uuid) to service_role;
