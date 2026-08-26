-- Prepare a tightly scoped Efí credit-card Production canary without enabling
-- the global customer capability. No canary row is inserted by this migration.

create table if not exists private.efi_card_production_canary_sessions (
  session_id uuid primary key references public.parking_sessions(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists efi_card_production_canary_sessions_actor_idx
  on private.efi_card_production_canary_sessions(actor_id);

revoke all on table private.efi_card_production_canary_sessions
  from public, anon, authenticated;

create or replace function private.is_efi_card_production_canary(
  target_session uuid,
  target_actor uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from private.efi_card_production_canary_sessions c
    join public.parking_sessions s on s.id = c.session_id
    where c.session_id = target_session
      and c.actor_id = target_actor
      and c.enabled
      and c.expires_at > now()
      and s.customer_owner_id = target_actor
      and s.status = 'PAYMENT_PENDING'
      and s.payment_status = 'PENDING'
      and s.financial_obligation = 'REQUIRED'
      and s.final_amount is not null
      and s.final_amount > 0
  );
$$;

revoke all on function private.is_efi_card_production_canary(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.is_efi_card_production_canary_for_actor(
  target_session uuid,
  target_actor uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_efi_card_production_canary(target_session,target_actor);
$$;

revoke all on function public.is_efi_card_production_canary_for_actor(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.is_efi_card_production_canary_for_actor(uuid,uuid)
  to service_role;

create or replace function private.authorize_efi_card_session_for_actor_environment(
  target_session uuid,
  target_actor uuid,
  target_environment text
)
returns public.parking_sessions
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.parking_sessions;
  capability_ready boolean;
  capability_enabled boolean;
  production_canary boolean := false;
begin
  if target_actor is null then
    raise exception 'PAYMENT_FORBIDDEN' using errcode='42501';
  end if;

  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_CARD_ENVIRONMENT_INVALID' using errcode='22023';
  end if;

  select * into session_row
  from public.parking_sessions
  where id = target_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode='P0002';
  end if;

  if session_row.customer_owner_id is distinct from target_actor then
    raise exception 'PAYMENT_FORBIDDEN' using errcode='42501';
  end if;

  select
    coalesce(a.configuration_state = 'READY', false),
    coalesce(a.enabled, false)
  into capability_ready, capability_enabled
  from public.payment_method_availability a
  where a.unit_id = session_row.unit_id
    and a.payment_method = 'CREDIT_CARD'
    and a.payment_channel = 'TOKENIZED_CHECKOUT'
    and a.payment_provider = 'EFI'
  limit 1;

  capability_ready := coalesce(capability_ready, false);
  capability_enabled := coalesce(capability_enabled, false);

  if target_environment = 'PRODUCTION' then
    production_canary := private.is_efi_card_production_canary(target_session,target_actor);
  end if;

  if not capability_ready
     or not (capability_enabled or production_canary) then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE' using errcode='22023';
  end if;

  return session_row;
end $$;

revoke all on function private.authorize_efi_card_session_for_actor_environment(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function public.get_or_reserve_efi_card_payment_for_actor(
  target_session uuid,
  target_actor uuid,
  target_environment text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  s public.parking_sessions;
  existing_payment uuid;
  current_payment uuid;
  new_payment uuid := gen_random_uuid();
begin
  if target_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'EFI_CARD_ENVIRONMENT_INVALID' using errcode='22023';
  end if;

  s := private.authorize_efi_card_session_for_actor_environment(
    target_session,
    target_actor,
    target_environment
  );
  perform pg_advisory_xact_lock(hashtextextended(target_session::text,0));

  select p.id into existing_payment
  from public.payments p
  where p.parking_session_id = target_session
    and p.provider = 'EFI'
    and p.method = 'CREDIT_CARD'
    and p.payment_channel = 'TOKENIZED_CHECKOUT'
    and p.provider_environment = target_environment
    and p.status = 'PENDING'
  order by p.created_at desc
  limit 1
  for update;

  if existing_payment is not null then
    return existing_payment;
  end if;

  select p.id into current_payment
  from public.payments p
  where p.parking_session_id = target_session
    and p.status in ('PENDING','PAID')
  order by p.created_at desc
  limit 1
  for update;

  if current_payment is not null then
    raise exception 'EFI_PAYMENT_PROVIDER_CONFLICT' using errcode='22023';
  end if;

  if s.status <> 'PAYMENT_PENDING'
     or s.payment_status <> 'PENDING'
     or s.final_amount is null
     or s.final_amount <= 0 then
    raise exception 'EFI_PAYMENT_NOT_READY' using errcode='22023';
  end if;

  insert into public.payments(
    id, unit_id, parking_session_id, amount, method, status, provider,
    provider_environment, payment_channel, operational_status,
    settlement_status, gross_amount, manual_confirmation, idempotency_key
  ) values (
    new_payment, s.unit_id, s.id, s.final_amount, 'CREDIT_CARD', 'PENDING', 'EFI',
    target_environment, 'TOKENIZED_CHECKOUT', 'PENDING',
    'PENDING', s.final_amount, false, gen_random_uuid()
  );

  return new_payment;
end $$;

revoke all on function public.get_or_reserve_efi_card_payment_for_actor(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_or_reserve_efi_card_payment_for_actor(uuid,uuid,text)
  to service_role;
