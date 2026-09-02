alter table public.monthly_subscriptions
  add column if not exists auto_renew boolean not null default false,
  add column if not exists preferred_payment_method text,
  add column if not exists renewal_provider text,
  add column if not exists next_billing_date date;

do $$ begin
  alter table public.monthly_subscriptions
    add constraint monthly_subscriptions_preferred_payment_method_check
    check (preferred_payment_method is null or preferred_payment_method in ('PIX','CREDIT_CARD','PIX_AUTOMATIC'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.monthly_subscriptions
    add constraint monthly_subscriptions_renewal_provider_check
    check (renewal_provider is null or renewal_provider in ('ASAAS','EFI'));
exception when duplicate_object then null; end $$;

create or replace function public.set_customer_monthly_auto_renew(
  target_subscription uuid,
  target_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.monthly_subscriptions;
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

  update public.monthly_subscriptions
  set auto_renew = target_enabled,
      cancel_at_period_end = case when target_enabled then false else cancel_at_period_end end,
      updated_at = now()
  where id = target_subscription;

  return jsonb_build_object(
    'subscriptionId', target_subscription,
    'autoRenew', target_enabled,
    'cancelAtPeriodEnd', case when target_enabled then false else target.cancel_at_period_end end
  );
end;
$$;

create or replace function public.cancel_customer_monthly_subscription_at_period_end(
  target_subscription uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
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
      updated_at = now()
  where id = target_subscription;

  return jsonb_build_object(
    'subscriptionId', target_subscription,
    'autoRenew', false,
    'cancelAtPeriodEnd', true,
    'coverageUntil', coverage_until
  );
end;
$$;

create or replace function public.mark_monthly_payment_preference_from_paid_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.monthly_billing_period_id is null or new.status::text <> 'PAID' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status::text = 'PAID' then
    return new;
  end if;

  if new.method::text in ('CREDIT_CARD','CARD') then
    update public.monthly_subscriptions s
    set auto_renew = true,
        preferred_payment_method = 'CREDIT_CARD',
        renewal_provider = coalesce(new.provider, 'ASAAS'),
        next_billing_date = (date_trunc('month', bp.due_date::timestamp) + interval '1 month' + (extract(day from bp.due_date)::int - 1) * interval '1 day')::date,
        cancel_at_period_end = false,
        updated_at = now()
    from public.monthly_billing_periods bp
    where bp.id = new.monthly_billing_period_id
      and s.id = bp.subscription_id;
  elsif new.method::text = 'PIX' then
    update public.monthly_subscriptions s
    set preferred_payment_method = coalesce(s.preferred_payment_method, 'PIX'),
        updated_at = now()
    from public.monthly_billing_periods bp
    where bp.id = new.monthly_billing_period_id
      and s.id = bp.subscription_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_monthly_payment_preference_from_paid on public.payments;
create trigger trg_monthly_payment_preference_from_paid
after insert or update of status on public.payments
for each row execute function public.mark_monthly_payment_preference_from_paid_payment();

grant execute on function public.set_customer_monthly_auto_renew(uuid, boolean) to authenticated;
grant execute on function public.cancel_customer_monthly_subscription_at_period_end(uuid) to authenticated;
