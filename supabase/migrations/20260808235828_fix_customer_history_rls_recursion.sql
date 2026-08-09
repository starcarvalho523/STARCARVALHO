create or replace function private.customer_owns_vehicle(target_vehicle uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.vehicles
    where id = target_vehicle and customer_id = (select auth.uid())
  )
$$;

create or replace function private.customer_owns_session(target_session uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.parking_sessions s
    join public.vehicles v on v.id = s.vehicle_id
    where s.id = target_session and v.customer_id = (select auth.uid())
  )
$$;

create or replace function private.customer_has_unit_session(target_unit uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.parking_sessions s
    join public.vehicles v on v.id = s.vehicle_id
    where s.unit_id = target_unit and v.customer_id = (select auth.uid())
  )
$$;

revoke all on function private.customer_owns_vehicle(uuid),
  private.customer_owns_session(uuid), private.customer_has_unit_session(uuid)
from public, anon;
grant execute on function private.customer_owns_vehicle(uuid),
  private.customer_owns_session(uuid), private.customer_has_unit_session(uuid)
to authenticated;

drop policy "vehicles_read_customer_own" on public.vehicles;
create policy "vehicles_read_customer_own"
on public.vehicles for select to authenticated
using (private.customer_owns_vehicle(id));

drop policy "sessions_read_customer_own" on public.parking_sessions;
create policy "sessions_read_customer_own"
on public.parking_sessions for select to authenticated
using (private.customer_owns_vehicle(vehicle_id));

drop policy "payments_read_customer_own" on public.payments;
create policy "payments_read_customer_own"
on public.payments for select to authenticated
using (private.customer_owns_session(parking_session_id));

drop policy "units_read_customer_session" on public.parking_units;
create policy "units_read_customer_session"
on public.parking_units for select to authenticated
using (private.customer_has_unit_session(id));

