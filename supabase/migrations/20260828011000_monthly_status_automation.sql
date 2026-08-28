-- Automatiza inadimplência sem criar um estado GRACE artificial.
-- A carência continua sendo calculada por monthly_billing_periods.grace_until.

create or replace function private.activate_monthly_subscription_after_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  owner_id uuid;
  recurring_binding public.monthly_recurring_provider_bindings;
  previous_status text;
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    select * into recurring_binding
      from public.monthly_recurring_provider_bindings b
     where b.subscription_id=new.subscription_id
       and b.provider='ASAAS'
       and b.method='PIX_AUTOMATIC'
     limit 1;

    if found and recurring_binding.authorization_status<>'ACTIVE' then
      return new;
    end if;

    select status into previous_status
      from public.monthly_subscriptions
     where id=new.subscription_id
     for update;

    update public.monthly_subscriptions
       set status='ACTIVE',
           suspended_at=null,
           suspension_reason=null,
           updated_at=clock_timestamp()
     where id=new.subscription_id
       and (
         status='PENDING_ACTIVATION'
         or (status='SUSPENDED' and suspension_reason='BILLING_OVERDUE')
       )
       and not exists (
         select 1
           from public.monthly_billing_periods overdue
          where overdue.subscription_id=new.subscription_id
            and overdue.status='PENDING'
            and overdue.grace_until < current_date
       )
     returning customer_id into owner_id;

    if owner_id is not null then
      perform private.create_customer_notification(
        owner_id,
        'MONTHLY_ACTIVATED',
        case when previous_status='SUSPENDED' then 'Mensalidade reativada' else 'Mensalidade ativada' end,
        case when previous_status='SUSPENDED'
          then 'Seu pagamento foi confirmado e a cobertura da mensalidade foi reativada.'
          else 'Sua mensalidade foi ativada após a confirmação do pagamento.'
        end,
        '/cliente/mensalidade',
        new.subscription_id||':MONTHLY_ACTIVE:'||new.id,
        null,
        new.id
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.run_monthly_subscription_status_automation_cron()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  unit_row record;
  item record;
  local_day date;
  suspended_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501';
  end if;

  for unit_row in select id, timezone from public.parking_units loop
    local_day := (clock_timestamp() at time zone unit_row.timezone)::date;

    for item in
      select s.id, s.customer_id
        from public.monthly_subscriptions s
       where s.unit_id=unit_row.id
         and s.status='ACTIVE'
         and exists (
           select 1
             from public.monthly_billing_periods bp
            where bp.subscription_id=s.id
              and bp.status='PENDING'
              and bp.grace_until < local_day
         )
       for update of s
    loop
      update public.monthly_subscriptions
         set status='SUSPENDED',
             suspended_at=clock_timestamp(),
             suspension_reason='BILLING_OVERDUE',
             updated_at=clock_timestamp()
       where id=item.id
         and status='ACTIVE';

      if found then
        suspended_count := suspended_count + 1;
        insert into public.audit_logs(unit_id,action,target_user_id,metadata)
        values(
          unit_row.id,
          'monthly.subscription.auto_suspended',
          item.customer_id,
          jsonb_build_object('subscription_id',item.id,'reason','BILLING_OVERDUE','local_day',local_day)
        );
      end if;
    end loop;
  end loop;

  return jsonb_build_object('suspended',suspended_count);
end;
$$;

revoke all on function public.run_monthly_subscription_status_automation_cron() from public, anon, authenticated;
grant execute on function public.run_monthly_subscription_status_automation_cron() to service_role;
