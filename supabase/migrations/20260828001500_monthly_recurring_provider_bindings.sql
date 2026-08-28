create table if not exists public.monthly_recurring_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.monthly_subscriptions(id) on delete cascade,
  provider text not null check (provider in ('ASAAS')),
  method text not null check (method in ('PIX_AUTOMATIC','CREDIT_CARD')),
  provider_customer_id text,
  provider_authorization_id text,
  provider_subscription_id text,
  authorization_status text check (authorization_status is null or authorization_status in ('PENDING','ACTIVE','REFUSED','CANCELLED','EXPIRED')),
  last_provider_event_id text,
  last_provider_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, method)
);

create unique index if not exists monthly_recurring_provider_bindings_authorization_uidx
  on public.monthly_recurring_provider_bindings(provider, provider_authorization_id)
  where provider_authorization_id is not null;
create unique index if not exists monthly_recurring_provider_bindings_subscription_uidx
  on public.monthly_recurring_provider_bindings(provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index if not exists monthly_recurring_provider_bindings_subscription_idx
  on public.monthly_recurring_provider_bindings(subscription_id);

create table if not exists public.monthly_recurring_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('ASAAS')),
  provider_event_id text not null,
  event_type text not null,
  provider_authorization_id text,
  provider_subscription_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_result text,
  unique (provider, provider_event_id)
);

create index if not exists monthly_recurring_provider_events_authorization_idx
  on public.monthly_recurring_provider_events(provider, provider_authorization_id)
  where provider_authorization_id is not null;

alter table public.monthly_recurring_provider_bindings enable row level security;
alter table public.monthly_recurring_provider_events enable row level security;
revoke all on public.monthly_recurring_provider_bindings from anon, authenticated;
revoke all on public.monthly_recurring_provider_events from anon, authenticated;
grant all on public.monthly_recurring_provider_bindings to service_role;
grant all on public.monthly_recurring_provider_events to service_role;

create or replace function public.upsert_monthly_recurring_binding(
  target_subscription uuid,
  target_method text,
  target_provider_customer_id text default null,
  target_provider_authorization_id text default null,
  target_provider_subscription_id text default null,
  target_authorization_status text default null
) returns public.monthly_recurring_provider_bindings
language plpgsql security definer set search_path = public, pg_temp
as $$
declare result public.monthly_recurring_provider_bindings;
begin
  if target_method not in ('PIX_AUTOMATIC','CREDIT_CARD') then raise exception 'INVALID_RECURRING_METHOD'; end if;
  if target_authorization_status is not null and target_authorization_status not in ('PENDING','ACTIVE','REFUSED','CANCELLED','EXPIRED') then raise exception 'INVALID_AUTHORIZATION_STATUS'; end if;
  insert into public.monthly_recurring_provider_bindings (
    subscription_id, provider, method, provider_customer_id, provider_authorization_id, provider_subscription_id, authorization_status
  ) values (
    target_subscription, 'ASAAS', target_method, target_provider_customer_id, target_provider_authorization_id, target_provider_subscription_id, target_authorization_status
  ) on conflict (subscription_id, method) do update set
    provider_customer_id=coalesce(excluded.provider_customer_id,monthly_recurring_provider_bindings.provider_customer_id),
    provider_authorization_id=coalesce(excluded.provider_authorization_id,monthly_recurring_provider_bindings.provider_authorization_id),
    provider_subscription_id=coalesce(excluded.provider_subscription_id,monthly_recurring_provider_bindings.provider_subscription_id),
    authorization_status=coalesce(excluded.authorization_status,monthly_recurring_provider_bindings.authorization_status),
    updated_at=now()
  returning * into result;
  return result;
end; $$;
revoke all on function public.upsert_monthly_recurring_binding(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.upsert_monthly_recurring_binding(uuid,text,text,text,text,text) to service_role;

create or replace function public.process_monthly_recurring_provider_event(
  event_id text,
  event_type text,
  authorization_id text,
  subscription_provider_id text,
  authorization_state text,
  provider_event_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  binding public.monthly_recurring_provider_bindings;
  inserted_event uuid;
begin
  if event_id is null or btrim(event_id)='' then raise exception 'PROVIDER_EVENT_ID_REQUIRED'; end if;
  if authorization_state is not null and authorization_state not in ('PENDING','ACTIVE','REFUSED','CANCELLED','EXPIRED') then raise exception 'INVALID_AUTHORIZATION_STATUS'; end if;

  insert into public.monthly_recurring_provider_events(provider,provider_event_id,event_type,provider_authorization_id,provider_subscription_id)
  values('ASAAS',event_id,event_type,authorization_id,subscription_provider_id)
  on conflict(provider,provider_event_id) do nothing returning id into inserted_event;
  if inserted_event is null then return jsonb_build_object('result','duplicate'); end if;

  select * into binding from public.monthly_recurring_provider_bindings b
  where b.provider='ASAAS' and ((authorization_id is not null and b.provider_authorization_id=authorization_id)
    or (subscription_provider_id is not null and b.provider_subscription_id=subscription_provider_id))
  order by b.created_at asc limit 1 for update;

  if binding.id is null then
    update public.monthly_recurring_provider_events set processed_at=now(),processing_result='unknown' where id=inserted_event;
    return jsonb_build_object('result','unknown');
  end if;

  update public.monthly_recurring_provider_bindings set
    authorization_status=coalesce(authorization_state,authorization_status),
    last_provider_event_id=event_id,last_provider_event_at=provider_event_at,updated_at=now()
  where id=binding.id;

  if authorization_state in ('CANCELLED','EXPIRED') then
    update public.monthly_subscriptions set status='SUSPENDED',suspended_at=now(),
      suspension_reason='PROVIDER_AUTHORIZATION_'||authorization_state,updated_at=now()
    where id=binding.subscription_id and status='ACTIVE';
  end if;

  update public.monthly_recurring_provider_events set processed_at=now(),processing_result='processed' where id=inserted_event;
  return jsonb_build_object('result','processed','subscriptionId',binding.subscription_id);
end; $$;
revoke all on function public.process_monthly_recurring_provider_event(text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.process_monthly_recurring_provider_event(text,text,text,text,text,timestamptz) to service_role;

create or replace function public.activate_monthly_subscription_if_financially_ready(target_billing_period uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  period public.monthly_billing_periods;
  binding public.monthly_recurring_provider_bindings;
  current_status text;
begin
  select * into period from public.monthly_billing_periods where id=target_billing_period for update;
  if period.id is null then raise exception 'BILLING_PERIOD_NOT_FOUND'; end if;
  if period.status <> 'PAID' then return jsonb_build_object('result','not_paid'); end if;

  select status into current_status from public.monthly_subscriptions where id=period.subscription_id for update;
  if current_status <> 'PENDING_ACTIVATION' then return jsonb_build_object('result','noop','status',current_status); end if;

  select * into binding from public.monthly_recurring_provider_bindings
  where subscription_id=period.subscription_id and provider='ASAAS'
  order by case when method='PIX_AUTOMATIC' then 0 else 1 end, created_at asc limit 1;

  if binding.id is null then return jsonb_build_object('result','binding_missing'); end if;
  if binding.method='PIX_AUTOMATIC' and binding.authorization_status <> 'ACTIVE' then
    return jsonb_build_object('result','authorization_not_active');
  end if;

  update public.monthly_subscriptions set status='ACTIVE',suspended_at=null,suspension_reason=null,updated_at=now()
  where id=period.subscription_id and status='PENDING_ACTIVATION';
  return jsonb_build_object('result','activated','subscriptionId',period.subscription_id);
end; $$;
revoke all on function public.activate_monthly_subscription_if_financially_ready(uuid) from public, anon, authenticated;
grant execute on function public.activate_monthly_subscription_if_financially_ready(uuid) to service_role;
