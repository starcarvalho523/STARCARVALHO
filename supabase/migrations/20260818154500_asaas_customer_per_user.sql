alter table public.customer_profiles
  add column if not exists billing_document text;

alter table public.customer_profiles
  drop constraint if exists customer_profiles_billing_document_check;
alter table public.customer_profiles
  add constraint customer_profiles_billing_document_check
  check (
    billing_document is null
    or billing_document ~ '^[0-9]{11}$'
    or billing_document ~ '^[0-9]{14}$'
  );

create table if not exists private.payment_provider_customers (
  provider text not null,
  environment text not null check (environment in ('SANDBOX','PRODUCTION')),
  customer_user_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  provider_customer_id text not null,
  external_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, environment, customer_user_id),
  unique (provider, environment, provider_customer_id),
  unique (provider, environment, external_reference)
);

revoke all on private.payment_provider_customers from public, anon, authenticated;

drop function if exists public.get_payment_customer_context(text, uuid, text, text);
create function public.get_payment_customer_context(
  subject_type text,
  subject_id uuid,
  target_provider text,
  target_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  target_user uuid;
  result jsonb;
begin
  if target_provider <> 'ASAAS' then
    raise exception 'PAYMENT_PROVIDER_UNSUPPORTED' using errcode = '22023';
  end if;
  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'PAYMENT_PROVIDER_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;

  if subject_type = 'PARKING_SESSION' then
    select coalesce(s.customer_owner_id, v.customer_id)
      into target_user
      from public.parking_sessions s
      left join public.vehicles v on v.id = s.vehicle_id
     where s.id = subject_id;
  elsif subject_type = 'MONTHLY_BILLING_PERIOD' then
    select ms.customer_id
      into target_user
      from public.monthly_billing_periods bp
      join public.monthly_subscriptions ms on ms.id = bp.subscription_id
     where bp.id = subject_id;
  else
    raise exception 'PAYMENT_SUBJECT_UNSUPPORTED' using errcode = '22023';
  end if;

  if target_user is null then
    raise exception 'PAYMENT_CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'user_id', cp.user_id,
    'full_name', cp.full_name,
    'email', au.email,
    'billing_document', cp.billing_document,
    'external_reference', 'starcarvalhos:' || cp.user_id::text,
    'provider_customer_id', ppc.provider_customer_id
  )
    into result
    from public.customer_profiles cp
    join auth.users au on au.id = cp.user_id
    left join private.payment_provider_customers ppc
      on ppc.provider = target_provider
     and ppc.environment = target_environment
     and ppc.customer_user_id = cp.user_id
   where cp.user_id = target_user
     and cp.is_active = true;

  if result is null then
    raise exception 'PAYMENT_CUSTOMER_PROFILE_UNAVAILABLE' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke all on function public.get_payment_customer_context(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_payment_customer_context(text, uuid, text, text) to service_role;

drop function if exists public.bind_payment_provider_customer(uuid, text, text, text, text);
create function public.bind_payment_provider_customer(
  customer_user_id uuid,
  target_provider text,
  target_environment text,
  target_provider_customer_id text,
  target_external_reference text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  bound_id text;
begin
  if target_provider <> 'ASAAS' then
    raise exception 'PAYMENT_PROVIDER_UNSUPPORTED' using errcode = '22023';
  end if;
  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'PAYMENT_PROVIDER_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if target_provider_customer_id is null or btrim(target_provider_customer_id) = '' then
    raise exception 'PAYMENT_PROVIDER_CUSTOMER_ID_REQUIRED' using errcode = '22023';
  end if;

  insert into private.payment_provider_customers(
    provider, environment, customer_user_id, provider_customer_id, external_reference
  ) values (
    target_provider, target_environment, customer_user_id, target_provider_customer_id, target_external_reference
  )
  on conflict (provider, environment, customer_user_id)
  do update set
    provider_customer_id = excluded.provider_customer_id,
    external_reference = excluded.external_reference,
    updated_at = now()
  returning provider_customer_id into bound_id;

  return bound_id;
end;
$$;

revoke all on function public.bind_payment_provider_customer(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bind_payment_provider_customer(uuid, text, text, text, text) to service_role;

create index if not exists payment_provider_customers_user_idx
  on private.payment_provider_customers(customer_user_id, provider, environment);
