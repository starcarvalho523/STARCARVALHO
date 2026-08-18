alter table public.payments
  add column if not exists provider_environment text;

alter table public.payments
  drop constraint if exists payments_provider_environment_check;
alter table public.payments
  add constraint payments_provider_environment_check
  check (provider_environment is null or provider_environment in ('SANDBOX','PRODUCTION'));

create table if not exists private.payment_provider_runtime_config (
  provider text primary key,
  environment text not null check (environment in ('SANDBOX','PRODUCTION')),
  live_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

revoke all on private.payment_provider_runtime_config from public, anon, authenticated;

insert into private.payment_provider_runtime_config(provider,environment,live_enabled)
values('ASAAS','SANDBOX',false)
on conflict(provider) do nothing;

create or replace function private.enforce_payment_provider_environment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare cfg private.payment_provider_runtime_config;
begin
  select * into cfg
  from private.payment_provider_runtime_config
  where provider = new.provider;

  if not found then
    raise exception 'PROVIDER_RUNTIME_CONFIG_MISSING:%', new.provider using errcode='55000';
  end if;

  if cfg.environment = 'PRODUCTION' and not cfg.live_enabled then
    raise exception 'PROVIDER_LIVE_DISABLED:%', new.provider using errcode='42501';
  end if;

  new.environment := cfg.environment;
  update public.payments
     set provider_environment = cfg.environment
   where id = new.payment_id;
  return new;
end;
$$;

revoke all on function private.enforce_payment_provider_environment() from public, anon, authenticated;

drop trigger if exists payment_provider_environment_guard on private.payment_provider_transactions;
create trigger payment_provider_environment_guard
before insert on private.payment_provider_transactions
for each row execute function private.enforce_payment_provider_environment();

update public.payments p
set provider_environment = t.environment
from private.payment_provider_transactions t
where t.payment_id = p.id
  and p.provider_environment is distinct from t.environment;
