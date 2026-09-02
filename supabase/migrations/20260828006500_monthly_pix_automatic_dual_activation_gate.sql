create or replace function private.activate_monthly_subscription_after_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  owner_id uuid;
  recurring_binding public.monthly_recurring_provider_bindings;
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    select * into recurring_binding
      from public.monthly_recurring_provider_bindings b
     where b.subscription_id=new.subscription_id
       and b.provider='ASAAS' and b.method='PIX_AUTOMATIC'
     limit 1;

    if found and recurring_binding.authorization_status<>'ACTIVE' then
      return new;
    end if;

    update public.monthly_subscriptions
       set status='ACTIVE',suspended_at=null,suspension_reason=null,updated_at=clock_timestamp()
     where id=new.subscription_id and status='PENDING_ACTIVATION'
     returning customer_id into owner_id;

    if owner_id is not null then
      perform private.create_customer_notification(
        owner_id,'MONTHLY_ACTIVATED','Mensalidade ativada',
        'Sua mensalidade foi ativada após a confirmação do pagamento.',
        '/cliente/mensalidade',new.subscription_id||':MONTHLY_ACTIVATED',null,new.id
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.process_monthly_recurring_provider_event(
  event_id text,
  event_type text,
  authorization_id text,
  subscription_provider_id text,
  authorization_state text,
  provider_event_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  binding public.monthly_recurring_provider_bindings;
  inserted_event uuid;
  initial_period public.monthly_billing_periods;
  activated_owner uuid;
begin
  if event_id is null or btrim(event_id)='' then raise exception 'PROVIDER_EVENT_ID_REQUIRED'; end if;
  if authorization_state is not null and authorization_state not in ('PENDING','ACTIVE','REFUSED','CANCELLED','EXPIRED') then raise exception 'INVALID_AUTHORIZATION_STATUS'; end if;

  insert into public.monthly_recurring_provider_events(provider,provider_event_id,event_type,provider_authorization_id,provider_subscription_id)
  values('ASAAS',event_id,event_type,authorization_id,subscription_provider_id)
  on conflict(provider,provider_event_id) do nothing
  returning id into inserted_event;
  if inserted_event is null then return jsonb_build_object('result','duplicate'); end if;

  select * into binding
    from public.monthly_recurring_provider_bindings b
   where b.provider='ASAAS'
     and ((authorization_id is not null and b.provider_authorization_id=authorization_id)
       or (subscription_provider_id is not null and b.provider_subscription_id=subscription_provider_id))
   order by b.created_at asc limit 1 for update;

  if binding.id is null then
    update public.monthly_recurring_provider_events set processed_at=now(),processing_result='unknown' where id=inserted_event;
    return jsonb_build_object('result','unknown');
  end if;

  update public.monthly_recurring_provider_bindings
     set authorization_status=coalesce(authorization_state,authorization_status),
         last_provider_event_id=event_id,last_provider_event_at=provider_event_at,updated_at=now()
   where id=binding.id;

  if authorization_state='ACTIVE' then
    if binding.initial_billing_period_id is not null then
      select * into initial_period from public.monthly_billing_periods where id=binding.initial_billing_period_id;
      if found and initial_period.status='PAID' then
        update public.monthly_subscriptions
           set status='ACTIVE',suspended_at=null,suspension_reason=null,updated_at=clock_timestamp()
         where id=binding.subscription_id and status='PENDING_ACTIVATION'
         returning customer_id into activated_owner;
        if activated_owner is not null then
          perform private.create_customer_notification(
            activated_owner,'MONTHLY_ACTIVATED','Mensalidade ativada',
            'Sua mensalidade foi ativada após a confirmação do pagamento.',
            '/cliente/mensalidade',binding.subscription_id||':MONTHLY_ACTIVATED',null,initial_period.id
          );
        end if;
      end if;
    end if;
  elsif authorization_state in ('CANCELLED','EXPIRED') then
    update public.monthly_subscriptions
       set status='SUSPENDED',suspended_at=now(),suspension_reason='PROVIDER_AUTHORIZATION_'||authorization_state,updated_at=now()
     where id=binding.subscription_id and status='ACTIVE';
  end if;

  update public.monthly_recurring_provider_events set processed_at=now(),processing_result='processed' where id=inserted_event;
  return jsonb_build_object('result','processed','subscriptionId',binding.subscription_id);
end;
$$;

revoke all on function public.process_monthly_recurring_provider_event(text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.process_monthly_recurring_provider_event(text,text,text,text,text,timestamptz) to service_role;
