create or replace function private.process_asaas_monthly_recurring_payment_webhook(
  target_event_id text,
  target_event_type text,
  external_payment_id text,
  target_provider_subscription_id text,
  external_status text,
  reported_amount numeric,
  target_due_date date,
  target_provider_environment text,
  safe_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  binding public.monthly_recurring_provider_bindings;
  period_row public.monthly_billing_periods;
  payment_row public.payments;
  candidate_count integer;
  current_count integer;
  event_state text;
  generated_reference text;
  next_anchor date;
  next_due date;
begin
  if coalesce(btrim(target_event_id),'')='' or coalesce(btrim(external_payment_id),'')='' then
    raise exception 'ASAAS_RECURRING_EVENT_INVALID';
  end if;
  if coalesce(btrim(target_provider_subscription_id),'')='' then
    return 'NOT_BOUND';
  end if;
  if target_event_type not in ('PAYMENT_CREATED','PAYMENT_CONFIRMED') then
    return 'IGNORED';
  end if;
  if reported_amount is null or reported_amount<=0 or target_due_date is null then
    raise exception 'ASAAS_RECURRING_PAYMENT_INVALID';
  end if;
  if target_provider_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'ASAAS_RECURRING_ENVIRONMENT_INVALID';
  end if;

  insert into private.payment_provider_events(
    provider,provider_event_id,event_type,provider_payment_id,provider_status,processing_status,sanitized_payload
  ) values (
    'ASAAS',target_event_id,target_event_type,external_payment_id,external_status,'RECEIVED',coalesce(safe_payload,'{}'::jsonb)
  ) on conflict(provider,provider_event_id) do nothing;

  select processing_status into event_state
    from private.payment_provider_events
   where provider='ASAAS' and provider_event_id=target_event_id
   for update;
  if event_state='PROCESSED' then return 'DUPLICATE'; end if;

  select * into binding
    from public.monthly_recurring_provider_bindings
   where provider='ASAAS'
     and method='CREDIT_CARD'
     and provider_subscription_id=target_provider_subscription_id
   for update;
  if not found then return 'NOT_BOUND'; end if;

  select count(*) into candidate_count
    from public.monthly_billing_periods bp
   where bp.subscription_id=binding.subscription_id
     and bp.due_date=target_due_date
     and bp.amount=reported_amount
     and bp.status in ('PENDING','PAID');

  if candidate_count<>1 then
    update private.payment_provider_events
       set processing_status='REVIEW',processed_at=clock_timestamp()
     where provider='ASAAS' and provider_event_id=target_event_id;
    return case when candidate_count=0 then 'REVIEW_NO_PERIOD' else 'REVIEW_AMBIGUOUS_PERIOD' end;
  end if;

  select * into period_row
    from public.monthly_billing_periods bp
   where bp.subscription_id=binding.subscription_id
     and bp.due_date=target_due_date
     and bp.amount=reported_amount
     and bp.status in ('PENDING','PAID')
   for update;

  perform pg_advisory_xact_lock(hashtextextended('MONTHLY_BILLING_PERIOD:'||period_row.id::text,0));

  select count(*) into current_count
    from public.payments p
   where p.monthly_billing_period_id=period_row.id
     and p.status in ('PENDING','PAID');

  if current_count>1 then
    update private.payment_provider_events
       set processing_status='REVIEW',processed_at=clock_timestamp()
     where provider='ASAAS' and provider_event_id=target_event_id;
    return 'REVIEW_MULTIPLE_CURRENT_PAYMENTS';
  end if;

  if current_count=1 then
    select * into payment_row
      from public.payments p
     where p.monthly_billing_period_id=period_row.id
       and p.status in ('PENDING','PAID')
     for update;

    if payment_row.provider<>'ASAAS'
       or payment_row.method not in ('CREDIT_CARD','CARD')
       or payment_row.provider_reference is distinct from external_payment_id then
      update private.payment_provider_events
         set processing_status='REVIEW',payment_id=payment_row.id,processed_at=clock_timestamp()
       where provider='ASAAS' and provider_event_id=target_event_id;
      return 'REVIEW_PAYMENT_CONFLICT';
    end if;
  else
    insert into public.payments(
      unit_id,amount,method,status,provider,provider_reference,manual_confirmation,
      payment_channel,operational_status,settlement_status,gross_amount,fee_amount,net_amount,
      payment_subject_type,monthly_billing_period_id,provider_environment
    ) values (
      period_row.unit_id,reported_amount,'CREDIT_CARD','PENDING','ASAAS',external_payment_id,false,
      'TOKENIZED_CHECKOUT','PENDING','PENDING',reported_amount,null,null,
      'MONTHLY_BILLING_PERIOD',period_row.id,target_provider_environment
    ) returning * into payment_row;
  end if;

  generated_reference := 'starcarvalhos:monthly-recurring:'||period_row.id::text||':'||external_payment_id;

  insert into private.payment_provider_transactions(
    payment_id,provider,environment,state,provider_payment_id,provider_customer_id,
    provider_status,external_reference,provider_amount,confirmed_at
  ) values (
    payment_row.id,'ASAAS',target_provider_environment,
    case when target_event_type='PAYMENT_CONFIRMED' then 'PAID' else 'PENDING' end,
    external_payment_id,binding.provider_customer_id,external_status,generated_reference,reported_amount,
    case when target_event_type='PAYMENT_CONFIRMED' then clock_timestamp() else null end
  ) on conflict do nothing;

  update private.payment_provider_transactions
     set provider_status=external_status,
         provider_amount=reported_amount,
         state=case when target_event_type='PAYMENT_CONFIRMED' then 'PAID' else state end,
         confirmed_at=case when target_event_type='PAYMENT_CONFIRMED' then coalesce(confirmed_at,clock_timestamp()) else confirmed_at end,
         updated_at=clock_timestamp()
   where payment_id=payment_row.id
     and provider='ASAAS'
     and provider_payment_id=external_payment_id;

  update private.payment_provider_events
     set payment_id=payment_row.id
   where provider='ASAAS' and provider_event_id=target_event_id;

  if target_event_type='PAYMENT_CONFIRMED' then
    perform private.mark_payment_subject_paid(payment_row.id,false);

    next_anchor := (date_trunc('month',period_row.due_date::timestamp)+interval '1 month')::date;
    next_due := private.monthly_due_date(
      extract(year from next_anchor)::int,
      extract(month from next_anchor)::int,
      extract(day from period_row.due_date)::int
    );

    update public.monthly_subscriptions
       set auto_renew=true,
           preferred_payment_method='CREDIT_CARD',
           renewal_provider='ASAAS',
           next_billing_date=next_due,
           cancel_at_period_end=false,
           updated_at=clock_timestamp()
     where id=binding.subscription_id;

    update public.monthly_recurring_provider_bindings
       set authorization_status='ACTIVE',
           last_provider_event_id=target_event_id,
           last_provider_event_at=clock_timestamp(),
           updated_at=clock_timestamp()
     where id=binding.id;
  end if;

  update private.payment_provider_events
     set processing_status='PROCESSED',processed_at=clock_timestamp()
   where provider='ASAAS' and provider_event_id=target_event_id;

  return 'PROCESSED';
end;
$$;

create or replace function public.process_asaas_monthly_recurring_payment_webhook(
  event_id text,
  event_type text,
  provider_payment_id text,
  provider_subscription_id text,
  provider_status text,
  reported_amount numeric,
  due_date date,
  provider_environment text,
  sanitized_payload jsonb
)
returns text
language sql
security definer
set search_path = pg_catalog, private
as $$
  select private.process_asaas_monthly_recurring_payment_webhook(
    event_id,event_type,provider_payment_id,provider_subscription_id,provider_status,
    reported_amount,due_date,provider_environment,sanitized_payload
  )
$$;

revoke all on function public.process_asaas_monthly_recurring_payment_webhook(text,text,text,text,text,numeric,date,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.process_asaas_monthly_recurring_payment_webhook(text,text,text,text,text,numeric,date,text,jsonb)
  to service_role;
