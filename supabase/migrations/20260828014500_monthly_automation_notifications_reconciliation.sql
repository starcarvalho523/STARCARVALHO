create or replace function public.run_monthly_customer_notifications_cron()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  unit_row record;
  item record;
  local_day date;
  sent_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501';
  end if;

  for unit_row in select id, timezone from public.parking_units loop
    local_day := (clock_timestamp() at time zone unit_row.timezone)::date;

    for item in
      select bp.id as billing_period_id, bp.subscription_id, bp.due_date, bp.grace_until,
             s.customer_id, s.status as subscription_status
        from public.monthly_billing_periods bp
        join public.monthly_subscriptions s on s.id=bp.subscription_id
       where bp.unit_id=unit_row.id
         and bp.status='PENDING'
         and s.status in ('ACTIVE','SUSPENDED')
    loop
      if item.due_date = local_day + 3 then
        perform private.create_customer_notification(
          item.customer_id,'MONTHLY_DUE_SOON','Mensalidade vence em 3 dias',
          'Sua mensalidade vence em 3 dias. Mantenha o pagamento em dia para preservar a cobertura.',
          '/cliente/mensalidade',item.billing_period_id||':MONTHLY_DUE_SOON',null,item.billing_period_id
        );
        sent_count := sent_count + 1;
      elsif item.due_date = local_day then
        perform private.create_customer_notification(
          item.customer_id,'MONTHLY_DUE_TODAY','Mensalidade vence hoje',
          'Sua mensalidade vence hoje. O Pix Automático será processado conforme sua autorização.',
          '/cliente/mensalidade',item.billing_period_id||':MONTHLY_DUE_TODAY',null,item.billing_period_id
        );
        sent_count := sent_count + 1;
      elsif item.grace_until = local_day then
        perform private.create_customer_notification(
          item.customer_id,'MONTHLY_GRACE_LAST_DAY','Último dia da carência',
          'Hoje é o último dia da carência da sua mensalidade. Após esse prazo, a cobertura poderá ser suspensa.',
          '/cliente/mensalidade',item.billing_period_id||':MONTHLY_GRACE_LAST_DAY',null,item.billing_period_id
        );
        sent_count := sent_count + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('notificationsAttempted',sent_count);
end;
$$;

revoke all on function public.run_monthly_customer_notifications_cron() from public, anon, authenticated;
grant execute on function public.run_monthly_customer_notifications_cron() to service_role;

create or replace function private.activate_monthly_subscription_after_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  owner_id uuid;
  recurring_binding public.monthly_recurring_provider_bindings;
  current_status text;
  current_reason text;
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    select * into recurring_binding
      from public.monthly_recurring_provider_bindings b
     where b.subscription_id=new.subscription_id
       and b.provider='ASAAS'
       and b.method='PIX_AUTOMATIC'
     order by b.created_at asc
     limit 1;

    if found and recurring_binding.authorization_status <> 'ACTIVE' then
      return new;
    end if;

    select status,suspension_reason into current_status,current_reason
      from public.monthly_subscriptions
     where id=new.subscription_id
     for update;

    if current_status='PENDING_ACTIVATION' or (current_status='SUSPENDED' and current_reason='BILLING_OVERDUE') then
      update public.monthly_subscriptions
         set status='ACTIVE', suspended_at=null, suspension_reason=null, updated_at=clock_timestamp()
       where id=new.subscription_id
         and (status='PENDING_ACTIVATION' or (status='SUSPENDED' and suspension_reason='BILLING_OVERDUE'))
       returning customer_id into owner_id;

      if owner_id is not null then
        perform private.create_customer_notification(
          owner_id,
          case when current_status='PENDING_ACTIVATION' then 'MONTHLY_ACTIVATED' else 'MONTHLY_REACTIVATED' end,
          case when current_status='PENDING_ACTIVATION' then 'Mensalidade ativada' else 'Mensalidade reativada' end,
          case when current_status='PENDING_ACTIVATION' then 'Sua mensalidade foi ativada após a confirmação do pagamento.' else 'Seu pagamento foi confirmado e a cobertura da mensalidade foi reativada.' end,
          '/cliente/mensalidade',
          new.subscription_id||':'||case when current_status='PENDING_ACTIVATION' then 'MONTHLY_ACTIVATED' else 'MONTHLY_REACTIVATED' end||':'||new.id,
          null,new.id
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.list_monthly_asaas_reconciliation_candidates()
returns table(
  payment_id uuid,
  provider_payment_id text,
  provider_status text,
  amount numeric,
  external_reference text
)
language sql
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select p.id, t.provider_payment_id, t.provider_status, p.amount, t.external_reference
    from public.payments p
    join private.payment_provider_transactions t on t.payment_id=p.id
   where (select auth.role())='service_role'
     and p.payment_subject_type='MONTHLY_BILLING_PERIOD'
     and p.provider='ASAAS'
     and p.status='PENDING'
     and t.provider='ASAAS'
     and t.provider_payment_id is not null
   order by p.created_at asc
   limit 500
$$;

revoke all on function public.list_monthly_asaas_reconciliation_candidates() from public, anon, authenticated;
grant execute on function public.list_monthly_asaas_reconciliation_candidates() to service_role;
