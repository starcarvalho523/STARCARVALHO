create or replace function private.mark_provider_pix_qr_ready(target_transaction uuid, pix_payload text, pix_image text, expiration timestamptz)
returns void
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $function$
declare
  effective_expiration timestamptz;
  is_monthly boolean;
begin
  select (p.payment_subject_type = 'MONTHLY_BILLING_PERIOD')
    into is_monthly
  from private.payment_provider_transactions t
  join public.payments p on p.id = t.payment_id
  where t.id = target_transaction;

  if coalesce(is_monthly,false) then
    effective_expiration := clock_timestamp() + interval '5 minutes';
  else
    effective_expiration := expiration;
  end if;

  update private.payment_provider_transactions
     set state='PENDING',
         qr_code_payload=pix_payload,
         qr_code_image_base64=pix_image,
         expires_at=effective_expiration,
         failure_code=null,
         failure_description=null,
         updated_at=clock_timestamp()
   where id=target_transaction
     and provider_payment_id is not null
     and state in ('PROVIDER_CREATED','QR_FETCHING','QR_PENDING','PENDING');

  if not found then
    raise exception 'PROVIDER_TRANSACTION_NOT_RECOVERABLE';
  end if;
end
$function$;
