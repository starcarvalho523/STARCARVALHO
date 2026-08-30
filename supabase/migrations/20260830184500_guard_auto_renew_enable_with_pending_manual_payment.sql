create or replace function public.has_customer_monthly_pending_manual_payment(target_subscription uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  owner_id uuid;
  has_pending boolean;
begin
  select customer_id into owner_id
  from public.monthly_subscriptions
  where id=target_subscription;

  if owner_id is null then
    raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND';
  end if;
  if owner_id is distinct from (select auth.uid()) then
    raise exception 'MONTHLY_SUBSCRIPTION_FORBIDDEN' using errcode='42501';
  end if;

  select exists(
    select 1
    from public.monthly_billing_periods bp
    join public.payments p on p.monthly_billing_period_id=bp.id
    where bp.subscription_id=target_subscription
      and bp.status='PENDING'
      and p.status='PENDING'
      and p.method in ('PIX','CREDIT_CARD')
  ) into has_pending;

  return has_pending;
end
$function$;

revoke all on function public.has_customer_monthly_pending_manual_payment(uuid) from public, anon;
grant execute on function public.has_customer_monthly_pending_manual_payment(uuid) to authenticated, service_role;
