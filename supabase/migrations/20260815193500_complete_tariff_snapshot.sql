-- Ensure every parking session freezes the complete tariff version used at entry.
-- Existing snapshots are completed only from their exact referenced tariff_rule_id.

create or replace function private.complete_parking_tariff_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  rule public.tariff_rules;
begin
  if new.tariff_rule_id is null then
    return new;
  end if;

  select * into rule
  from public.tariff_rules
  where id = new.tariff_rule_id;

  if not found then
    raise exception 'TARIFF_RULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  new.tariff_snapshot := coalesce(new.tariff_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'version_number', rule.version_number,
      'daily_after_minutes', rule.daily_after_minutes
    );

  return new;
end;
$$;

revoke all on function private.complete_parking_tariff_snapshot() from public, anon, authenticated;

drop trigger if exists parking_sessions_complete_tariff_snapshot on public.parking_sessions;
create trigger parking_sessions_complete_tariff_snapshot
before insert on public.parking_sessions
for each row execute function private.complete_parking_tariff_snapshot();

update public.parking_sessions s
set tariff_snapshot = coalesce(s.tariff_snapshot, '{}'::jsonb)
  || jsonb_build_object(
    'version_number', t.version_number,
    'daily_after_minutes', t.daily_after_minutes
  )
from public.tariff_rules t
where t.id = s.tariff_rule_id
  and (
    not coalesce(s.tariff_snapshot, '{}'::jsonb) ? 'version_number'
    or not coalesce(s.tariff_snapshot, '{}'::jsonb) ? 'daily_after_minutes'
  );
