create extension if not exists pg_cron with schema extensions;

create or replace function private.run_monthly_billing_scheduler(dry_run boolean default false)
returns jsonb
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
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'MONTHLY_SCHEDULER_FORBIDDEN' using errcode = '42501';
  end if;

  for unit_row in select id, timezone from public.parking_units loop
    local_day := (clock_timestamp() at time zone unit_row.timezone)::date;
    unit_result := private.generate_current_monthly_billing_periods_for_unit(
      unit_row.id, local_day, dry_run, 'CRON', null
    );
    results := results || jsonb_build_array(
      jsonb_build_object('unitId', unit_row.id, 'localDay', local_day, 'result', unit_result)
    );
  end loop;

  return results;
end;
$$;

revoke all on function private.run_monthly_billing_scheduler(boolean) from public, anon, authenticated;
grant execute on function private.run_monthly_billing_scheduler(boolean) to postgres, service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'starcarvalho-monthly-billing';

select cron.schedule(
  'starcarvalho-monthly-billing',
  '10 6 * * *',
  $$select private.run_monthly_billing_scheduler(false);$$
);
