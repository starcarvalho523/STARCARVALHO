create or replace function public.expire_monthly_credit_checkout_if_stale(
  target_billing_period uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_payment public.payments;
  target_transaction private.payment_provider_transactions;
  owner_id uuid;
begin
  select s.customer_id into owner_id
  from public.monthly_billing_periods bp
  join public.monthly_subscriptions s on s.id = bp.subscription_id
  where bp.id = target_billing_period;

  if owner_id is null then
    raise exception 'MONTHLY_BILLING_PERIOD_NOT_FOUND';
  end if;
  if owner_id is distinct from auth.uid() then
    raise exception 'MONTHLY_BILLING_PERIOD_FORBIDDEN';
  end if;

  select p.* into target_payment
  from public.payments p
  where p.monthly_billing_period_id = target_billing_period
    and p.method::text in ('CREDIT_CARD','CARD')
    and p.status::text = 'PENDING'
  order by p.created_at desc
  limit 1;

  if target_payment.id is null then
    return jsonb_build_object('result','none');
  end if;

  select t.* into target_transaction
  from private.payment_provider_transactions t
  where t.payment_id = target_payment.id
  order by t.created_at desc
  limit 1;

  if target_transaction.id is null or target_transaction.expires_at is null or target_transaction.expires_at > now() then
    return jsonb_build_object('result','active');
  end if;

  update public.payments
  set status = 'FAILED'
  where id = target_payment.id
    and status::text = 'PENDING';

  update private.payment_provider_transactions
  set state = 'CREATE_FAILED',
      provider_status = 'EXPIRED',
      failure_code = 'CHECKOUT_EXPIRED',
      failure_description = 'Checkout expired before payment confirmation',
      updated_at = now()
  where id = target_transaction.id
    and state not in ('PAID','SETTLED');

  return jsonb_build_object('result','expired','paymentId',target_payment.id);
end;
$$;

create or replace function public.bind_monthly_card_recurring_subscription(
  target_provider_payment_id text,
  target_provider_subscription_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_payment public.payments;
  target_period public.monthly_billing_periods;
  target_subscription public.monthly_subscriptions;
begin
  if coalesce(trim(target_provider_payment_id),'') = '' or coalesce(trim(target_provider_subscription_id),'') = '' then
    raise exception 'MONTHLY_CARD_RECURRING_BINDING_REQUIRED';
  end if;

  select * into target_payment
  from public.payments
  where provider = 'ASAAS'
    and provider_reference = target_provider_payment_id
    and monthly_billing_period_id is not null
  order by created_at desc
  limit 1;

  if target_payment.id is null then
    return jsonb_build_object('result','unknown_payment');
  end if;

  select * into target_period
  from public.monthly_billing_periods
  where id = target_payment.monthly_billing_period_id;

  select * into target_subscription
  from public.monthly_subscriptions
  where id = target_period.subscription_id;

  insert into public.monthly_recurring_provider_bindings(
    subscription_id,
    provider,
    method,
    provider_subscription_id,
    authorization_status,
    initial_billing_period_id,
    updated_at
  ) values (
    target_subscription.id,
    'ASAAS',
    'CREDIT_CARD',
    target_provider_subscription_id,
    'ACTIVE',
    target_period.id,
    now()
  )
  on conflict (subscription_id, method) do update
  set provider_subscription_id = excluded.provider_subscription_id,
      authorization_status = 'ACTIVE',
      initial_billing_period_id = coalesce(monthly_recurring_provider_bindings.initial_billing_period_id, excluded.initial_billing_period_id),
      updated_at = now();

  update public.monthly_subscriptions
  set auto_renew = true,
      preferred_payment_method = 'CREDIT_CARD',
      renewal_provider = 'ASAAS',
      next_billing_date = (date_trunc('month', target_period.due_date::timestamp) + interval '1 month' + (extract(day from target_period.due_date)::int - 1) * interval '1 day')::date,
      cancel_at_period_end = false,
      updated_at = now()
  where id = target_subscription.id;

  return jsonb_build_object(
    'result','bound',
    'subscriptionId',target_subscription.id,
    'providerSubscriptionId',target_provider_subscription_id
  );
end;
$$;

revoke all on function public.bind_monthly_card_recurring_subscription(text,text) from public, anon, authenticated;
grant execute on function public.bind_monthly_card_recurring_subscription(text,text) to service_role;
grant execute on function public.expire_monthly_credit_checkout_if_stale(uuid) to authenticated;
