-- Corrige a reconciliação da recorrência de cartão para a regra comercial de 30 dias corridos.
-- A função é chamada somente pelo backend com service_role após o webhook financeiro ter sido processado.

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
  local_today date;
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

  select (clock_timestamp() at time zone u.timezone)::date into local_today
  from public.parking_units u
  where u.id=subscription.unit_id;
  if local_today is null then raise exception 'MONTHLY_UNIT_NOT_FOUND' using errcode='P0002'; end if;

  -- Nunca volta a agenda para trás. O vencimento confirmado abre o ciclo seguinte
  -- exatamente 30 dias depois, e atrasos de webhook avançam a cadência até uma data futura.
  candidate:=greatest(confirmed_due_date+30,coalesce(subscription.next_billing_date,confirmed_due_date+30));
  while candidate<=local_today loop
    candidate:=candidate+30;
  end loop;

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
    'next_billing_date',candidate,
    'cadence_days',30
  ));

  return candidate;
end $$;

revoke all on function public.reconcile_asaas_recurring_30_day_schedule(text,date) from public,anon,authenticated;
grant execute on function public.reconcile_asaas_recurring_30_day_schedule(text,date) to service_role;
