-- Isolated minimal schema used only to execute the Phase 8A migration locally.
create schema if not exists auth;
create schema if not exists private;
create extension if not exists pgcrypto;
do $$ begin
  create role anon;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null;
end $$;
create table auth.users (id uuid primary key);
create type public.app_role as enum ('owner', 'manager', 'operator', 'customer');
create table public.parking_units (id uuid primary key default gen_random_uuid(), name text, timezone text not null default 'America/Bahia');
create table public.monthly_subscriptions (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.parking_units(id), plan_id uuid,
  status text not null, starts_on date not null, ends_on date, due_day integer not null, grace_days integer not null default 0,
  contracted_price numeric(12,2) not null
);
create table public.monthly_billing_periods (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.monthly_subscriptions(id),
  unit_id uuid not null references public.parking_units(id), reference_year integer not null, reference_month smallint not null,
  period_start date not null, period_end date not null, due_date date not null, grace_until date not null,
  amount numeric(12,2) not null, status text not null default 'PENDING',
  unique (subscription_id, reference_year, reference_month)
);
create function private.monthly_due_date(p_year integer, p_month integer, p_due_day integer) returns date language sql immutable as $$
  select make_date(p_year, p_month, least(p_due_day, extract(day from (make_date(p_year,p_month,1)+interval '1 month - 1 day'))::integer))
$$;
create function private.has_unit_role(p_unit uuid, p_roles public.app_role[]) returns boolean language sql stable as $$ select true $$;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
