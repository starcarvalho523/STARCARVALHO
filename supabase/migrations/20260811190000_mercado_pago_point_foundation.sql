-- Phase 3 foundation only: no Mercado Pago calls and no operational Point method.
alter table public.payment_method_availability drop constraint if exists payment_method_availability_configuration_state_check;
alter table public.payment_method_availability add constraint payment_method_availability_configuration_state_check
  check (configuration_state in ('READY','DISABLED','UNCONFIGURED','AWAITING_TERMINAL')) not valid;
alter table public.payment_method_availability validate constraint payment_method_availability_configuration_state_check;

update public.payment_method_availability
set enabled=false,configuration_state='AWAITING_TERMINAL',updated_at=clock_timestamp()
where payment_channel='POINT' and payment_provider='MERCADO_PAGO';

create table public.payment_terminals(
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  provider text not null check(provider='MERCADO_PAGO'),
  provider_store_id text,
  provider_pos_id text,
  provider_terminal_id text,
  name text not null check(length(btrim(name)) between 1 and 120),
  model text,
  operating_mode text check(operating_mode is null or operating_mode in ('STANDALONE','PDV')),
  status text not null default 'AWAITING_TERMINAL' check(status in ('NOT_CONFIGURED','AWAITING_TERMINAL','READY','DISABLED','ERROR')),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_terminal_ready_check check(not enabled or (status='READY' and operating_mode='PDV' and provider_terminal_id is not null and provider_pos_id is not null and provider_store_id is not null))
);
create unique index payment_terminals_provider_external_idx on public.payment_terminals(provider,provider_terminal_id) where provider_terminal_id is not null;
create index payment_terminals_unit_status_idx on public.payment_terminals(unit_id,status,enabled);
alter table public.payment_terminals enable row level security;
create policy payment_terminals_ceo_read on public.payment_terminals for select to authenticated
using(private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[]));
revoke all on table public.payment_terminals from public,anon,authenticated;
grant select on table public.payment_terminals to authenticated;
grant select,insert,update,delete on table public.payment_terminals to service_role;

alter table private.payment_provider_transactions
  add column if not exists provider_order_id text,
  add column if not exists provider_terminal_id text;
alter table private.payment_provider_transactions drop constraint if exists payment_provider_transactions_provider_check;
alter table private.payment_provider_transactions add constraint payment_provider_transactions_provider_check
  check(provider in ('ASAAS','MERCADO_PAGO')) not valid;
alter table private.payment_provider_transactions validate constraint payment_provider_transactions_provider_check;
create unique index payment_provider_transactions_provider_order_idx
  on private.payment_provider_transactions(provider,provider_order_id) where provider_order_id is not null;

revoke all on table private.payment_provider_transactions from public,anon,authenticated;

