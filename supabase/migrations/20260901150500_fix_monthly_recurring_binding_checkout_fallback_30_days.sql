create or replace function public.bind_monthly_card_recurring_from_subscription_event(
  target_event_id text,
  target_event_type text,
  target_provider_subscription_id text,
  target_provider_customer_id text,
  target_amount numeric,
  target_provider_status text,
  target_next_due_date date,
  target_external_reference text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  candidate_count integer;
  target_payment public.payments;
  target_period public.monthly_billing_periods;
  target_subscription public.monthly_subscriptions;
  next_due_date date;
begin
  if coalesce(btrim(target_event_id),'')='' then raise exception 'MONTHLY_CARD_SUBSCRIPTION_EVENT_ID_REQUIRED'; end if;
  if coalesce(btrim(target_provider_subscription_id),'')='' then raise exception 'MONTHLY_CARD_PROVIDER_SUBSCRIPTION_REQUIRED'; end if;
  if coalesce(btrim(target_provider_customer_id),'')='' then raise exception 'MONTHLY_CARD_PROVIDER_CUSTOMER_REQUIRED'; end if;
  if target_amount is null or target_amount <= 0 then raise exception 'MONTHLY_CARD_SUBSCRIPTION_AMOUNT_INVALID'; end if;

  insert into public.monthly_recurring_provider_events(provider,provider_event_id,event_type,provider_subscription_id,processing_result)
  values('ASAAS',target_event_id,target_event_type,target_provider_subscription_id,'RECEIVED')
  on conflict(provider,provider_event_id) do nothing;

  if exists(select 1 from public.monthly_recurring_provider_events where provider='ASAAS' and provider_event_id=target_event_id and processed_at is not null) then
    return jsonb_build_object('result','duplicate');
  end if;

  with candidates as (
    select p.id
    from public.payments p
    join private.payment_provider_transactions t on t.payment_id=p.id
    join public.monthly_billing_periods bp on bp.id=p.monthly_billing_period_id
    join public.monthly_subscriptions s on s.id=bp.subscription_id
    where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
      and p.provider='ASAAS'
      and p.method in ('CREDIT_CARD','CARD')
      and p.amount=target_amount
      and p.status in ('PENDING','PAID')
      and t.provider='ASAAS'
      and t.provider_checkout_id is not null
      and t.created_at >= clock_timestamp()-interval '2 hours'
      and not exists (
        select 1 from public.monthly_recurring_provider_bindings b
        where b.subscription_id=s.id and b.method='CREDIT_CARD' and b.provider_subscription_id is not null
      )
      and (
        (target_external_reference is not null and t.external_reference=target_external_reference)
        or (target_external_reference is null and t.provider_customer_id=target_provider_customer_id)
      )
  )
  select count(*) into candidate_count from candidates;

  if candidate_count=0 then
    with candidates as (
      select p.id
      from public.payments p
      join private.payment_provider_transactions t on t.payment_id=p.id
      join public.monthly_billing_periods bp on bp.id=p.monthly_billing_period_id
      join public.monthly_subscriptions s on s.id=bp.subscription_id
      where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
        and p.provider='ASAAS'
        and p.method in ('CREDIT_CARD','CARD')
        and p.amount=target_amount
        and p.status in ('PENDING','PAID')
        and t.provider='ASAAS'
        and t.provider_checkout_id is not null
        and t.created_at >= clock_timestamp()-interval '2 hours'
        and not exists (
          select 1 from public.monthly_recurring_provider_bindings b
          where b.subscription_id=s.id and b.method='CREDIT_CARD' and b.provider_subscription_id is not null
        )
    )
    select count(*) into candidate_count from candidates;
  end if;

  if candidate_count<>1 then
    update public.monthly_recurring_provider_events
    set processed_at=clock_timestamp(), processing_result=case when candidate_count=0 then 'unknown' else 'ambiguous' end
    where provider='ASAAS' and provider_event_id=target_event_id;
    return jsonb_build_object('result',case when candidate_count=0 then 'unknown' else 'ambiguous' end,'candidates',candidate_count);
  end if;

  select p.* into target_payment
  from public.payments p
  join private.payment_provider_transactions t on t.payment_id=p.id
  join public.monthly_billing_periods bp on bp.id=p.monthly_billing_period_id
  join public.monthly_subscriptions s on s.id=bp.subscription_id
  where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
    and p.provider='ASAAS'
    and p.method in ('CREDIT_CARD','CARD')
    and p.amount=target_amount
    and p.status in ('PENDING','PAID')
    and t.provider='ASAAS'
    and t.provider_checkout_id is not null
    and t.created_at >= clock_timestamp()-interval '2 hours'
    and not exists (
      select 1 from public.monthly_recurring_provider_bindings b
      where b.subscription_id=s.id and b.method='CREDIT_CARD' and b.provider_subscription_id is not null
    )
    and (
      (target_external_reference is not null and t.external_reference=target_external_reference)
      or (target_external_reference is null and t.provider_customer_id=target_provider_customer_id)
    )
  order by t.created_at desc
  limit 1;

  if target_payment.id is null then
    select p.* into target_payment
    from public.payments p
    join private.payment_provider_transactions t on t.payment_id=p.id
    join public.monthly_billing_periods bp on bp.id=p.monthly_billing_period_id
    join public.monthly_subscriptions s on s.id=bp.subscription_id
    where p.payment_subject_type='MONTHLY_BILLING_PERIOD'
      and p.provider='ASAAS'
      and p.method in ('CREDIT_CARD','CARD')
      and p.amount=target_amount
      and p.status in ('PENDING','PAID')
      and t.provider='ASAAS'
      and t.provider_checkout_id is not null
      and t.created_at >= clock_timestamp()-interval '2 hours'
      and not exists (
        select 1 from public.monthly_recurring_provider_bindings b
        where b.subscription_id=s.id and b.method='CREDIT_CARD' and b.provider_subscription_id is not null
      )
    order by t.created_at desc
    limit 1;
  end if;

  select * into target_period from public.monthly_billing_periods where id=target_payment.monthly_billing_period_id;
  select * into target_subscription from public.monthly_subscriptions where id=target_period.subscription_id;
  next_due_date := target_period.due_date + 30;

  insert into public.monthly_recurring_provider_bindings(subscription_id,provider,method,provider_customer_id,provider_subscription_id,authorization_status,initial_billing_period_id,last_provider_event_id,last_provider_event_at,updated_at)
  values(target_subscription.id,'ASAAS','CREDIT_CARD',target_provider_customer_id,target_provider_subscription_id,case when target_provider_status='ACTIVE' then 'ACTIVE' else 'PENDING' end,target_period.id,target_event_id,clock_timestamp(),clock_timestamp())
  on conflict(subscription_id,method) do update
  set provider_customer_id=excluded.provider_customer_id,
      provider_subscription_id=excluded.provider_subscription_id,
      authorization_status=excluded.authorization_status,
      initial_billing_period_id=coalesce(public.monthly_recurring_provider_bindings.initial_billing_period_id,excluded.initial_billing_period_id),
      last_provider_event_id=excluded.last_provider_event_id,
      last_provider_event_at=excluded.last_provider_event_at,
      updated_at=clock_timestamp();

  update private.payment_provider_transactions
  set provider_customer_id=coalesce(provider_customer_id,target_provider_customer_id),updated_at=clock_timestamp()
  where payment_id=target_payment.id and provider='ASAAS';

  update public.monthly_subscriptions
  set auto_renew=true,
      preferred_payment_method='CREDIT_CARD',
      renewal_provider='ASAAS',
      next_billing_date=next_due_date,
      cancel_at_period_end=false,
      updated_at=clock_timestamp()
  where id=target_subscription.id;

  update public.monthly_recurring_provider_events
  set processed_at=clock_timestamp(),processing_result='processed'
  where provider='ASAAS' and provider_event_id=target_event_id;

  return jsonb_build_object('result','bound','subscriptionId',target_subscription.id,'providerSubscriptionId',target_provider_subscription_id,'nextBillingDate',next_due_date,'providerNextDueDate',target_next_due_date);
end;
$$;

revoke all on function public.bind_monthly_card_recurring_from_subscription_event(text,text,text,text,numeric,text,date,text) from public, anon, authenticated;
grant execute on function public.bind_monthly_card_recurring_from_subscription_event(text,text,text,text,numeric,text,date,text) to service_role;