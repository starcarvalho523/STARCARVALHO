-- Monthly payment attempts: 5-minute operational PIX lifetime and safe method switching.

create or replace function private.mark_provider_pix_qr_ready(
  target_transaction uuid,
  pix_payload text,
  pix_image text,
  expiration timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  operational_expiration timestamptz := clock_timestamp() + interval '5 minutes';
begin
  if expiration is not null then
    operational_expiration := least(expiration, operational_expiration);
  end if;

  update private.payment_provider_transactions
     set state = 'PENDING',
         qr_code_payload = pix_payload,
         qr_code_image_base64 = pix_image,
         expires_at = operational_expiration,
         failure_code = null,
         failure_description = null,
         updated_at = clock_timestamp()
   where id = target_transaction
     and provider_payment_id is not null
     and state in ('PROVIDER_CREATED','QR_FETCHING','QR_PENDING','PENDING');

  if not found then
    raise exception 'PROVIDER_TRANSACTION_NOT_RECOVERABLE';
  end if;
end
$$;

create or replace function public.get_monthly_payment_switch_context(
  target_billing_period uuid,
  target_method public.parking_payment_method
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  current_payment public.payments;
  current_transaction private.payment_provider_transactions;
  should_close boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform private.authorize_monthly_payment(target_billing_period);

  if target_method not in ('PIX','CREDIT_CARD') then
    raise exception 'MONTHLY_PAYMENT_METHOD_NOT_AVAILABLE';
  end if;

  select *
    into current_payment
    from public.payments
   where monthly_billing_period_id = target_billing_period
     and status = 'PENDING'
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('shouldClose', false);
  end if;

  select *
    into current_transaction
    from private.payment_provider_transactions
   where payment_id = current_payment.id
   order by created_at desc
   limit 1;

  should_close := current_payment.method <> target_method
    or (
      current_payment.method = 'PIX'
      and current_transaction.expires_at is not null
      and current_transaction.expires_at <= clock_timestamp()
    );

  return jsonb_build_object(
    'shouldClose', should_close,
    'paymentId', current_payment.id,
    'method', current_payment.method,
    'providerPaymentId', current_transaction.provider_payment_id,
    'providerCheckoutId', current_transaction.provider_checkout_id,
    'expiresAt', current_transaction.expires_at,
    'state', current_transaction.state
  );
end
$$;

create or replace function public.finalize_monthly_payment_method_switch(
  target_billing_period uuid,
  target_payment uuid,
  target_method public.parking_payment_method
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  actor uuid := (select auth.uid());
  period_row public.monthly_billing_periods;
  payment_row public.payments;
  transaction_row private.payment_provider_transactions;
  reason_code text;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  period_row := private.authorize_monthly_payment(target_billing_period);
  perform pg_advisory_xact_lock(hashtextextended('MONTHLY_BILLING_PERIOD:' || target_billing_period::text, 0));

  select *
    into payment_row
    from public.payments
   where id = target_payment
     and monthly_billing_period_id = target_billing_period
   for update;

  if not found then
    return;
  end if;

  if payment_row.status = 'PAID' then
    raise exception 'MONTHLY_PAYMENT_ALREADY_PAID';
  end if;

  if payment_row.status <> 'PENDING' then
    return;
  end if;

  select *
    into transaction_row
    from private.payment_provider_transactions
   where payment_id = payment_row.id
   order by created_at desc
   limit 1
   for update;

  if payment_row.method = target_method then
    if payment_row.method <> 'PIX'
      or transaction_row.expires_at is null
      or transaction_row.expires_at > clock_timestamp() then
      return;
    end if;
    reason_code := 'PIX_EXPIRED_5_MINUTES';
  else
    reason_code := 'PAYMENT_METHOD_SWITCH';
  end if;

  update public.payments
     set status = 'CANCELLED'
   where id = payment_row.id
     and status = 'PENDING';

  update private.payment_provider_transactions
     set state = 'CANCELLED',
         provider_status = 'CANCELLED',
         failure_code = reason_code,
         failure_description = null,
         expires_at = least(coalesce(expires_at, clock_timestamp()), clock_timestamp()),
         updated_at = clock_timestamp()
   where payment_id = payment_row.id;

  insert into public.audit_logs(actor_user_id, unit_id, action, target_user_id, metadata)
  select actor,
         period_row.unit_id,
         case when reason_code = 'PIX_EXPIRED_5_MINUTES'
              then 'monthly.payment.pix_expired'
              else 'monthly.payment.method_switched' end,
         s.customer_id,
         jsonb_build_object(
           'billing_period_id', target_billing_period,
           'payment_id', payment_row.id,
           'previous_method', payment_row.method,
           'next_method', target_method,
           'reason', reason_code
         )
    from public.monthly_subscriptions s
   where s.id = period_row.subscription_id;
end
$$;

revoke all on function public.get_monthly_payment_switch_context(uuid, public.parking_payment_method) from public, anon;
revoke all on function public.finalize_monthly_payment_method_switch(uuid, uuid, public.parking_payment_method) from public, anon;
grant execute on function public.get_monthly_payment_switch_context(uuid, public.parking_payment_method) to authenticated, service_role;
grant execute on function public.finalize_monthly_payment_method_switch(uuid, uuid, public.parking_payment_method) to authenticated, service_role;
