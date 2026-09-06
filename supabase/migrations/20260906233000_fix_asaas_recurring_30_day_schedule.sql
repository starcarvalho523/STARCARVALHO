-- Corrige a recorrência de cartão para a regra comercial de 30 dias corridos.
-- Também cria a competência local quando o Asaas gerar antecipadamente uma cobrança futura.

create or replace function public.ensure_asaas_recurring_billing_period(
  target_provider_subscription_id text,
  target_due_date date,
  target_amount numeric
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,private as $$
declare
  binding public.monthly_recurring_provider_bindings;
  subscription public.monthly_subscriptions;
  period_id uuid;
  cycle_due date;
  previous_due date;
begin
  if coalesce(btrim(target_provider_subscription_id),'')='' or target_due_date is null or target_amount is null or target_amount<=0 then
    raise exception 'ASAAS_RECURRING_PERIOD_INVALID' using errcode='22023';
  end if;

  select * into binding
  from public.monthly_recurring_provider_bindings b
  where b.provider='ASAAS'
    and b.method='CREDIT_CARD'
    and b.provider_subscription_id=target_provider_subscription_id
  for update;
  if not found then return null; end if;

  select * into subscription
  from public.monthly_subscriptions s
  where s.id=binding.subscription_id
  for update;
  if not found then raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND' using errcode='P0002'; end if;

  if round(target_amount,2)<>round(subscription.contracted_price,2) then
    raise exception 'ASAAS_RECURRING_PERIOD_AMOUNT_MISMATCH' using errcode='22023';
  end if;

  select id into period_id
  from public.monthly_billing_periods p
  where p.subscription_id=subscription.id and p.due_date=target_due_date
  limit 1;
  if period_id is not null then return period_id; end if;

  -- A data recebida precisa pertencer exatamente à sequência de 30 dias iniciada em starts_on.
  cycle_due:=subscription.starts_on;
  while cycle_due<target_due_date loop
    cycle_due:=private.monthly_cycle_next_date(cycle_due);
  end loop;
  if cycle_due<>target_due_date or (subscription.ends_on is not null and target_due_date>subscription.ends_on) then
    raise exception 'ASAAS_RECURRING_PERIOD_OFF_CADENCE' using errcode='22023';
  end if;

  select max(p.due_date) into previous_due
  from public.monthly_billing_periods p
  where p.subscription_id=subscription.id and p.due_date<target_due_date;
  if previous_due is not null and target_due_date<>private.monthly_cycle_next_date(previous_due) then
    raise exception 'ASAAS_RECURRING_PERIOD_GAP' using errcode='22023';
  end if;

  insert into public.monthly_billing_periods(
    subscription_id,unit_id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount
  ) values(
    subscription.id,subscription.unit_id,
    extract(year from target_due_date)::integer,extract(month from target_due_date)::smallint,
    target_due_date,private.monthly_cycle_end(target_due_date),target_due_date,
    target_due_date+subscription.grace_days,subscription.contracted_price
  )
  on conflict(subscription_id,due_date) do nothing
  returning id into period_id;

  if period_id is null then
    select id into period_id from public.monthly_billing_periods
    where subscription_id=subscription.id and due_date=target_due_date;
  end if;

  insert into public.audit_logs(actor_user_id,unit_id,action,target_user_id,metadata)
  values(null,subscription.unit_id,'monthly.billing_period.provider_created',subscription.customer_id,jsonb_build_object(
    'subscription_id',subscription.id,
    'billing_period_id',period_id,
    'due_date',target_due_date,
    'provider','ASAAS',
    'cycle_days',30
  ));

  return period_id;
end $$;

create or replace function public.reconcile_asaas_recurring_30_day_schedule(
  target_provider_subscription_id text,
  confirmed_due_date date
) returns date
language plpgsql
security definer
set search_path=pg_catalog,public,private as $$
declare
  binding public.monthly_recurring_provider_bindings;
  subscription public.monthly_subscriptions;
  latest_period_due date;
  candidate date;
begin
  if coalesce(btrim(target_provider_subscription_id),'')='' or confirmed_due_date is null then
    raise exception 'ASAAS_RECURRING_SCHEDULE_INVALID' using errcode='22023';
  end if;

  select * into binding
  from public.monthly_recurring_provider_bindings b
  where b.provider='ASAAS'
    and b.method='CREDIT_CARD'
    and b.provider_subscription_id=target_provider_subscription_id
  for update;
  if not found then raise exception 'ASAAS_RECURRING_BINDING_NOT_FOUND' using errcode='P0002'; end if;

  select * into subscription
  from public.monthly_subscriptions s
  where s.id=binding.subscription_id
  for update;
  if not found then raise exception 'MONTHLY_SUBSCRIPTION_NOT_FOUND' using errcode='P0002'; end if;

  select max(p.due_date) into latest_period_due
  from public.monthly_billing_periods p
  where p.subscription_id=subscription.id;

  -- A agenda local aponta para a próxima competência ainda não representada no banco.
  -- Se o Asaas já antecipou a criação de uma competência futura, avançamos 30 dias a partir dela.
  candidate:=private.monthly_cycle_next_date(greatest(confirmed_due_date,coalesce(latest_period_due,confirmed_due_date)));

  update public.monthly_subscriptions
  set next_billing_date=candidate,
      auto_renew=true,
      preferred_payment_method='CREDIT_CARD',
      renewal_provider='ASAAS',
      cancel_at_period_end=false,
      updated_at=clock_timestamp()
  where id=subscription.id;

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(null,subscription.unit_id,'monthly.recurring.schedule.reconciled',jsonb_build_object(
    'subscription_id',subscription.id,
    'confirmed_due_date',confirmed_due_date,
    'latest_billing_period_due',latest_period_due,
    'next_billing_date',candidate,
    'cadence_days',30
  ));

  return candidate;
end $$;

revoke all on function public.ensure_asaas_recurring_billing_period(text,date,numeric) from public,anon,authenticated;
revoke all on function public.reconcile_asaas_recurring_30_day_schedule(text,date) from public,anon,authenticated;
grant execute on function public.ensure_asaas_recurring_billing_period(text,date,numeric) to service_role;
grant execute on function public.reconcile_asaas_recurring_30_day_schedule(text,date) to service_role;
