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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.monthly_recurring_provider_bindings;
begin
  if target_method not in ('PIX_AUTOMATIC','CREDIT_CARD') then
    raise exception 'INVALID_RECURRING_METHOD';
  end if;

  if target_authorization_status is not null and target_authorization_status not in ('PENDING','ACTIVE','REFUSED','CANCELLED','EXPIRED') then
    raise exception 'INVALID_AUTHORIZATION_STATUS';
  end if;

  insert into public.monthly_recurring_provider_bindings (
    subscription_id, provider, method, provider_customer_id,
    provider_authorization_id, provider_subscription_id, authorization_status
  ) values (
    target_subscription, 'ASAAS', target_method, target_provider_customer_id,
    target_provider_authorization_id, target_provider_subscription_id, target_authorization_status
  )
  on conflict (subscription_id, method) do update set
    provider_customer_id = coalesce(excluded.provider_customer_id, monthly_recurring_provider_bindings.provider_customer_id),
    provider_authorization_id = coalesce(excluded.provider_authorization_id, monthly_recurring_provider_bindings.provider_authorization_id),
    provider_subscription_id = coalesce(excluded.provider_subscription_id, monthly_recurring_provider_bindings.provider_subscription_id),
    authorization_status = coalesce(excluded.authorization_status, monthly_recurring_provider_bindings.authorization_status),
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  binding public.monthly_recurring_provider_bindings;
  inserted_event uuid;
  next_subscription_status text;
begin
  if event_id is null or btrim(event_id) = '' then
    raise exception 'PROVIDER_EVENT_ID_REQUIRED';
  end if;

  if authorization_state is not null and authorization_state not in ('PENDING','ACTIVE','REFUSED','CANCELLED','EXPIRED') then
    raise exception 'INVALID_AUTHORIZATION_STATUS';
  end if;

  insert into public.monthly_recurring_provider_events (
    provider, provider_event_id, event_type, provider_authorization_id, provider_subscription_id
  ) values ('ASAAS', event_id, event_type, authorization_id, subscription_provider_id)
  on conflict (provider, provider_event_id) do nothing
  returning id into inserted_event;

  if inserted_event is null then
    return jsonb_build_object('result','duplicate');
  end if;

  select * into binding
  from public.monthly_recurring_provider_bindings b
  where b.provider = 'ASAAS'
    and ((authorization_id is not null and b.provider_authorization_id = authorization_id)
      or (subscription_provider_id is not null and b.provider_subscription_id = subscription_provider_id))
  order by b.created_at asc
  limit 1
  for update;

  if binding.id is null then
    update public.monthly_recurring_provider_events
      set processed_at = now(), processing_result = 'unknown'
      where id = inserted_event;
    return jsonb_build_object('result','unknown');
  end if;

  update public.monthly_recurring_provider_bindings
  set authorization_status = coalesce(authorization_state, authorization_status),
      last_provider_event_id = event_id,
      last_provider_event_at = provider_event_at,
      updated_at = now()
  where id = binding.id;

  next_subscription_status := case authorization_state
    when 'ACTIVE' then 'ACTIVE'
    when 'REFUSED' then 'PENDING_ACTIVATION'
    when 'CANCELLED' then 'SUSPENDED'
    when 'EXPIRED' then 'SUSPENDED'
    else null
  end;

  if next_subscription_status is not null then
    update public.monthly_subscriptions
    set status = next_subscription_status,
        suspended_at = case when next_subscription_status = 'SUSPENDED' then now() else null end,
        suspension_reason = case when next_subscription_status = 'SUSPENDED' then 'PROVIDER_AUTHORIZATION_' || authorization_state else null end,
        updated_at = now()
    where id = binding.subscription_id
      and status not in ('CANCELED');
  end if;

  update public.monthly_recurring_provider_events
    set processed_at = now(), processing_result = 'processed'
    where id = inserted_event;

  return jsonb_build_object('result','processed','subscriptionId',binding.subscription_id);
end;
$$;

revoke all on function public.process_monthly_recurring_provider_event(text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.process_monthly_recurring_provider_event(text,text,text,text,text,timestamptz) to service_role;
