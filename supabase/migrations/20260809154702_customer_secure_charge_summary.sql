create or replace function private.customer_parking_charge(target_session uuid)
returns table (
  entered_at timestamptz,
  reference_time timestamptz,
  duration_minutes integer,
  tariff_name text,
  total numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  session_row public.parking_sessions;
  now_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null or not private.customer_owns_session(target_session) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into session_row
  from public.parking_sessions
  where id = target_session;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select
    session_row.entered_at,
    now_at,
    greatest(0, ceil(extract(epoch from (now_at - session_row.entered_at)) / 60)::integer),
    session_row.tariff_snapshot->>'name',
    case
      when session_row.status = 'OPEN' then private.charge_amount(
        session_row.tariff_snapshot,
        session_row.entered_at,
        coalesce(session_row.exit_requested_at, now_at)
      )
      else coalesce(session_row.final_amount, session_row.calculated_amount, 0)
    end;
end;
$$;

revoke all on function private.customer_parking_charge(uuid) from public, anon;
grant execute on function private.customer_parking_charge(uuid) to authenticated;

create or replace function public.customer_parking_charge(session_id uuid)
returns table (
  entered_at timestamptz,
  reference_time timestamptz,
  duration_minutes integer,
  tariff_name text,
  total numeric
)
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$
  select * from private.customer_parking_charge(session_id)
$$;

revoke all on function public.customer_parking_charge(uuid) from public, anon;
grant execute on function public.customer_parking_charge(uuid) to authenticated;

