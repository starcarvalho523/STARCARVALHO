create or replace function public.bind_monthly_card_recurring_subscription(
  target_provider_payment_id text,
  target_provider_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_payment public.payments;
  target_period public.monthly_billing_periods;
  target_subscription public.monthly_subscriptions;
  next_month_start date;
  next_month_end date;
  next_due_date date;
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

  next_month_start := (date_trunc('month', target_period.due_date::timestamp) + interval '1 month')::date;
  next_month_end := (date_trunc('month', target_period.due_date::timestamp) + interval '2 months - 1 day')::date;
  next_due_date := least(
    next_month_end,
    next_month_start + (extract(day from target_period.due_date)::int - 1)
  );

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
      next_billing_date = next_due_date,
      cancel_at_period_end = false,
      updated_at = now()
  where id = target_subscription.id;

  return jsonb_build_object(
    'result','bound',
    'subscriptionId',target_subscription.id,
    'providerSubscriptionId',target_provider_subscription_id,
    'nextBillingDate',next_due_date
  );
end;
$function$;
