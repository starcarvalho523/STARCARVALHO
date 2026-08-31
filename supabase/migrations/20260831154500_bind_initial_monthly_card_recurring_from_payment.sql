create or replace function public.bind_initial_monthly_card_recurring_from_payment(
  target_event_id text,
  target_provider_payment_id text,
  target_provider_subscription_id text,
  target_provider_customer_id text,
  target_provider_checkout_id text,
  target_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate_count integer;
  target_payment_id uuid;
  target_transaction_id uuid;
  target_period public.monthly_billing_periods;
  target_subscription public.monthly_subscriptions;
  calculated_next_due date;
begin
  if coalesce(btrim(target_event_id),'')='' or coalesce(btrim(target_provider_payment_id),'')='' or coalesce(btrim(target_provider_subscription_id),'')='' or coalesce(btrim(target_provider_customer_id),'')='' or coalesce(btrim(target_provider_checkout_id),'')='' then
    raise exception 'MONTHLY_CARD_INITIAL_BIND_INPUT_REQUIRED';
  end if;
  if target_amount is null or target_amount <= 0 then raise exception 'MONTHLY_CARD_INITIAL_BIND_AMOUNT_INVALID'; end if;

  select count(*) into candidate_count
  from public.payments p
  join private.payment_provider_transactions t on t.payment_id=p.id
  where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
    and p.provider='ASAAS'
    and p.method in ('CREDIT_CARD','CARD')
    and p.amount=target_amount
    and p.status in ('PENDING','PAID')
    and t.provider='ASAAS'
    and t.provider_checkout_id=target_provider_checkout_id
    and t.created_at >= clock_timestamp()-interval '24 hours';

  if candidate_count<>1 then
    return jsonb_build_object('result',case when candidate_count=0 then 'unknown' else 'ambiguous' end,'candidates',candidate_count);
  end if;

  select p.id,t.id into target_payment_id,target_transaction_id
  from public.payments p
  join private.payment_provider_transactions t on t.payment_id=p.id
  where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
    and p.provider='ASAAS'
    and p.method in ('CREDIT_CARD','CARD')
    and p.amount=target_amount
    and p.status in ('PENDING','PAID')
    and t.provider='ASAAS'
    and t.provider_checkout_id=target_provider_checkout_id
    and t.created_at >= clock_timestamp()-interval '24 hours'
  order by t.created_at desc limit 1;

  select bp.* into target_period
  from public.monthly_billing_periods bp
  join public.payments p on p.monthly_billing_period_id=bp.id
  where p.id=target_payment_id;
  select * into target_subscription from public.monthly_subscriptions where id=target_period.subscription_id;
  calculated_next_due := private.monthly_due_date((date_trunc('month',target_period.due_date::timestamp)+interval '1 month')::date, target_subscription.due_day);

  update private.payment_provider_transactions
  set provider_payment_id=coalesce(provider_payment_id,target_provider_payment_id),
      provider_customer_id=coalesce(provider_customer_id,target_provider_customer_id),
      provider_status=case when state='PAID' then coalesce(provider_status,'CONFIRMED') else provider_status end,
      updated_at=clock_timestamp()
  where id=target_transaction_id;

  update public.payments
  set provider_reference=coalesce(provider_reference,target_provider_payment_id)
  where id=target_payment_id;

  insert into public.monthly_recurring_provider_bindings(subscription_id,provider,method,provider_customer_id,provider_subscription_id,authorization_status,initial_billing_period_id,last_provider_event_id,last_provider_event_at,updated_at)
  values(target_subscription.id,'ASAAS','CREDIT_CARD',target_provider_customer_id,target_provider_subscription_id,'ACTIVE',target_period.id,target_event_id,clock_timestamp(),clock_timestamp())
  on conflict(subscription_id,method) do update
  set provider_customer_id=excluded.provider_customer_id,
      provider_subscription_id=excluded.provider_subscription_id,
      authorization_status='ACTIVE',
      initial_billing_period_id=coalesce(public.monthly_recurring_provider_bindings.initial_billing_period_id,excluded.initial_billing_period_id),
      last_provider_event_id=excluded.last_provider_event_id,
      last_provider_event_at=excluded.last_provider_event_at,
      updated_at=clock_timestamp();

  update public.monthly_subscriptions
  set auto_renew=true,preferred_payment_method='CREDIT_CARD',renewal_provider='ASAAS',next_billing_date=calculated_next_due,cancel_at_period_end=false,updated_at=clock_timestamp()
  where id=target_subscription.id;

  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  select null,target_period.unit_id,'MONTHLY_CARD_RECURRING_BOUND_FROM_PAYMENT',target_subscription.customer_id,
    jsonb_build_object('billing_period_id',target_period.id,'payment_id',target_payment_id,'provider_subscription_id',target_provider_subscription_id,'provider_payment_id',target_provider_payment_id,'next_billing_date',calculated_next_due)
  where not exists(select 1 from public.audit_logs a where a.action='MONTHLY_CARD_RECURRING_BOUND_FROM_PAYMENT' and a.metadata->>'provider_payment_id'=target_provider_payment_id);

  return jsonb_build_object('result','bound','subscriptionId',target_subscription.id,'providerSubscriptionId',target_provider_subscription_id,'nextBillingDate',calculated_next_due);
end $$;

revoke all on function public.bind_initial_monthly_card_recurring_from_payment(text,text,text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.bind_initial_monthly_card_recurring_from_payment(text,text,text,text,text,numeric) to service_role;
