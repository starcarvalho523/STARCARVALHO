-- A subscription scheduled to end after its paid coverage must not expose a future billing date.
-- Temporary auto-renew disable keeps next_billing_date so the customer can reactivate it.

update public.monthly_subscriptions
set next_billing_date = null,
    updated_at = now()
where cancel_at_period_end is true
  and next_billing_date is not null;

create or replace function public.cancel_customer_monthly_subscription_at_period_end(target_subscription uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.monthly_subscriptions;
  coverage_until date;
begin
  select * into target
  from public.monthly_subscriptions
  where id = target_subscription;

  if target.id is null then
    raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND';
  end if;
  if target.customer_id is distinct from auth.uid() then
    raise exception 'MONTHLY_SUBSCRIPTION_FORBIDDEN';
  end if;

  select max(period_end) into coverage_until
  from public.monthly_billing_periods
  where subscription_id = target_subscription
    and status = 'PAID';

  update public.monthly_subscriptions
  set auto_renew = false,
      cancel_at_period_end = true,
      next_billing_date = null,
      updated_at = now()
  where id = target_subscription;

  return jsonb_build_object(
    'subscriptionId', target_subscription,
    'autoRenew', false,
    'cancelAtPeriodEnd', true,
    'nextBillingDate', null,
    'coverageUntil', coverage_until
  );
end;
$$;

create or replace function public.get_customer_monthly_renewal_context(target_subscription uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.monthly_subscriptions;
  binding public.monthly_recurring_provider_bindings;
  coverage_until date;
begin
  select * into target
  from public.monthly_subscriptions
  where id = target_subscription;

  if target.id is null then
    raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND';
  end if;
  if target.customer_id is distinct from auth.uid() then
    raise exception 'MONTHLY_SUBSCRIPTION_FORBIDDEN';
  end if;

  select * into binding
  from public.monthly_recurring_provider_bindings
  where subscription_id = target_subscription
    and method = 'CREDIT_CARD'
  limit 1;

  select max(period_end) into coverage_until
  from public.monthly_billing_periods
  where subscription_id = target_subscription
    and status = 'PAID';

  return jsonb_build_object(
    'subscriptionId', target.id,
    'status', target.status,
    'autoRenew', target.auto_renew,
    'preferredPaymentMethod', target.preferred_payment_method,
    'renewalProvider', target.renewal_provider,
    'nextBillingDate', case when target.cancel_at_period_end then null else target.next_billing_date end,
    'cancelAtPeriodEnd', target.cancel_at_period_end,
    'coverageUntil', coverage_until,
    'providerSubscriptionId', binding.provider_subscription_id,
    'providerAuthorizationStatus', binding.authorization_status
  );
end;
$$;
