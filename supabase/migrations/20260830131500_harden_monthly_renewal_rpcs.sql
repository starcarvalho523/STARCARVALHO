-- Customer renewal RPCs are authenticated-only and write an audit record on real state transitions.

create or replace function public.set_customer_monthly_auto_renew(target_subscription uuid, target_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.monthly_subscriptions;
  resulting_cancel boolean;
  changed boolean;
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

  resulting_cancel := case when target_enabled then false else target.cancel_at_period_end end;
  changed := target.auto_renew is distinct from target_enabled
    or target.cancel_at_period_end is distinct from resulting_cancel;

  update public.monthly_subscriptions
  set auto_renew = target_enabled,
      cancel_at_period_end = resulting_cancel,
      updated_at = now()
  where id = target_subscription;

  if changed then
    insert into public.audit_logs(actor_user_id, unit_id, action, target_user_id, metadata)
    values(
      auth.uid(),
      target.unit_id,
      case when target_enabled then 'MONTHLY_AUTO_RENEW_ENABLED' else 'MONTHLY_AUTO_RENEW_DISABLED' end,
      target.customer_id,
      jsonb_build_object('subscriptionId', target_subscription)
    );
  end if;

  return jsonb_build_object(
    'subscriptionId', target_subscription,
    'autoRenew', target_enabled,
    'cancelAtPeriodEnd', resulting_cancel
  );
end;
$$;

create or replace function public.cancel_customer_monthly_subscription_at_period_end(target_subscription uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.monthly_subscriptions;
  coverage_until date;
  changed boolean;
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

  changed := target.auto_renew is distinct from false
    or target.cancel_at_period_end is distinct from true
    or target.next_billing_date is not null;

  update public.monthly_subscriptions
  set auto_renew = false,
      cancel_at_period_end = true,
      next_billing_date = null,
      updated_at = now()
  where id = target_subscription;

  if changed then
    insert into public.audit_logs(actor_user_id, unit_id, action, target_user_id, metadata)
    values(
      auth.uid(),
      target.unit_id,
      'MONTHLY_CANCEL_AT_PERIOD_END',
      target.customer_id,
      jsonb_build_object('subscriptionId', target_subscription, 'coverageUntil', coverage_until)
    );
  end if;

  return jsonb_build_object(
    'subscriptionId', target_subscription,
    'autoRenew', false,
    'cancelAtPeriodEnd', true,
    'nextBillingDate', null,
    'coverageUntil', coverage_until
  );
end;
$$;

revoke all on function public.set_customer_monthly_auto_renew(uuid, boolean) from public, anon;
revoke all on function public.cancel_customer_monthly_subscription_at_period_end(uuid) from public, anon;
revoke all on function public.get_customer_monthly_renewal_context(uuid) from public, anon;

grant execute on function public.set_customer_monthly_auto_renew(uuid, boolean) to authenticated, service_role;
grant execute on function public.cancel_customer_monthly_subscription_at_period_end(uuid) to authenticated, service_role;
grant execute on function public.get_customer_monthly_renewal_context(uuid) to authenticated, service_role;
