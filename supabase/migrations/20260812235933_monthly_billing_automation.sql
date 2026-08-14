-- Fase 8A: gera somente competências do mês civil corrente para assinaturas ACTIVE.
-- Não cria payments, não chama providers e não gera competências retroativas ou futuras.

create table public.monthly_billing_generation_runs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id),
  source text not null check (source in ('CRON', 'MANUAL')),
  target_date date not null,
  processed_count integer not null default 0 check (processed_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  existing_count integer not null default 0 check (existing_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  contracted_amount numeric(12,2) not null default 0 check (contracted_amount >= 0),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  created_by uuid references auth.users(id),
  check (finished_at is null or finished_at >= started_at)
);

create index monthly_billing_generation_runs_unit_started_idx
  on public.monthly_billing_generation_runs(unit_id, started_at desc);

alter table public.monthly_billing_generation_runs enable row level security;

create policy monthly_billing_generation_runs_read_authorized
on public.monthly_billing_generation_runs for select to authenticated using (
  private.has_unit_role(unit_id, array['owner', 'manager']::public.app_role[])
);

revoke all on public.monthly_billing_generation_runs from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.monthly_billing_generation_runs from authenticated;
grant select on public.monthly_billing_generation_runs to authenticated;
grant all on public.monthly_billing_generation_runs to service_role;

create or replace function private.generate_current_monthly_billing_periods_for_unit(
  target_unit uuid,
  target_day date,
  dry_run boolean default false,
  run_source text default 'CRON',
  actor uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  item record;
  period_id uuid;
  run_id uuid;
  p_processed_count integer := 0;
  p_created_count integer := 0;
  p_existing_count integer := 0;
  p_skipped_count integer := 0;
  p_failed_count integer := 0;
  p_contracted_amount numeric(12,2) := 0;
  month_start date := date_trunc('month', target_day)::date;
  month_end date := (date_trunc('month', target_day)::date + interval '1 month - 1 day')::date;
begin
  if target_unit is null or target_day is null or run_source not in ('CRON', 'MANUAL') then
    raise exception 'MONTHLY_AUTOMATION_INVALID_REQUEST' using errcode = '22023';
  end if;

  if not dry_run then
    insert into public.monthly_billing_generation_runs(unit_id, source, target_date, created_by)
    values (target_unit, run_source, target_day, actor)
    returning id into run_id;
  end if;

  -- O lock por assinatura protege o snapshot contra alteração concorrente de plano/status.
  -- A constraint única da competência é a segunda barreira de idempotência entre workers.
  for item in
    select s.id, s.unit_id, s.starts_on, s.ends_on, s.due_day, s.grace_days, s.contracted_price
      from public.monthly_subscriptions s
     where s.unit_id = target_unit
       and s.status = 'ACTIVE'
       and s.plan_id is not null
     for update of s
  loop
    p_processed_count := p_processed_count + 1;

    -- Reativação, suspensão e cancelamento nunca produzem backfill: somente mês corrente.
    if item.starts_on is null or item.starts_on > month_end
       or (item.ends_on is not null and item.ends_on < month_start) then
      p_skipped_count := p_skipped_count + 1;
      continue;
    end if;

    select id into period_id
      from public.monthly_billing_periods
     where subscription_id = item.id
       and reference_year = extract(year from target_day)::integer
       and reference_month = extract(month from target_day)::smallint;

    if period_id is not null then
      p_existing_count := p_existing_count + 1;
      continue;
    end if;

    if dry_run then
      p_created_count := p_created_count + 1;
      p_contracted_amount := p_contracted_amount + item.contracted_price;
      continue;
    end if;

    begin
      insert into public.monthly_billing_periods(
        subscription_id, unit_id, reference_year, reference_month,
        period_start, period_end, due_date, grace_until, amount
      ) values (
        item.id, item.unit_id, extract(year from target_day)::integer, extract(month from target_day)::smallint,
        month_start, month_end,
        private.monthly_due_date(extract(year from target_day)::integer, extract(month from target_day)::integer, item.due_day),
        private.monthly_due_date(extract(year from target_day)::integer, extract(month from target_day)::integer, item.due_day) + item.grace_days,
        item.contracted_price
      ) on conflict (subscription_id, reference_year, reference_month) do nothing
      returning id into period_id;

      if period_id is null then
        p_existing_count := p_existing_count + 1;
      else
        p_created_count := p_created_count + 1;
        p_contracted_amount := p_contracted_amount + item.contracted_price;
      end if;
    exception when others then
      -- O lote termina as demais assinaturas; a execução agrega apenas a contagem de falhas.
      p_failed_count := p_failed_count + 1;
    end;
  end loop;

  if run_id is not null then
    update public.monthly_billing_generation_runs
       set processed_count = p_processed_count,
           created_count = p_created_count,
           existing_count = p_existing_count,
           skipped_count = p_skipped_count,
           failed_count = p_failed_count,
           contracted_amount = p_contracted_amount,
           finished_at = clock_timestamp()
     where id = run_id;
  end if;

  return jsonb_build_object(
    'processed', p_processed_count,
    'created', p_created_count,
    'existing', p_existing_count,
    'skipped', p_skipped_count,
    'failed', p_failed_count,
    'contractedAmount', p_contracted_amount,
    'dryRun', dry_run,
    'runId', run_id
  );
end;
$$;

create or replace function public.run_monthly_billing_generation(
  target_unit uuid,
  dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  actor uuid := auth.uid();
  local_day date;
begin
  if actor is null or not private.has_unit_role(target_unit, array['owner', 'manager']::public.app_role[]) then
    raise exception 'MONTHLY_ADMIN_FORBIDDEN' using errcode = '42501';
  end if;

  select (clock_timestamp() at time zone timezone)::date
    into local_day
    from public.parking_units
   where id = target_unit;

  if local_day is null then
    raise exception 'MONTHLY_UNIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return private.generate_current_monthly_billing_periods_for_unit(
    target_unit, local_day, dry_run, 'MANUAL', actor
  );
end;
$$;

create or replace function public.run_monthly_billing_generation_cron(
  dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  unit_row record;
  local_day date;
  unit_result jsonb;
  results jsonb := '[]'::jsonb;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode = '42501';
  end if;

  for unit_row in select id, timezone from public.parking_units loop
    local_day := (clock_timestamp() at time zone unit_row.timezone)::date;
    unit_result := private.generate_current_monthly_billing_periods_for_unit(
      unit_row.id, local_day, dry_run, 'CRON', null
    );
    results := results || jsonb_build_array(jsonb_build_object('unitId', unit_row.id, 'result', unit_result));
  end loop;
  return results;
end;
$$;

revoke all on function private.generate_current_monthly_billing_periods_for_unit(uuid, date, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.run_monthly_billing_generation(uuid, boolean) from public, anon;
revoke all on function public.run_monthly_billing_generation_cron(boolean) from public, anon, authenticated;
grant execute on function public.run_monthly_billing_generation(uuid, boolean) to authenticated;
grant execute on function public.run_monthly_billing_generation_cron(boolean) to service_role;
