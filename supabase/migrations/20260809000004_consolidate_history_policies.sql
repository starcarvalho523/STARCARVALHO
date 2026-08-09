drop index if exists public.parking_sessions_unit_exited_history_idx;

drop policy "vehicles_read_unit_staff" on public.vehicles;
drop policy "vehicles_read_customer_own" on public.vehicles;
create policy "vehicles_read_authorized"
on public.vehicles for select to authenticated
using (
  private.customer_owns_vehicle(id)
  or exists (
    select 1 from public.parking_sessions s
    where s.vehicle_id = vehicles.id
      and private.has_unit_role(s.unit_id, array['owner','manager','operator','finance','auditor']::public.app_role[])
  )
);

drop policy "sessions_read_unit_staff" on public.parking_sessions;
drop policy "sessions_read_customer_own" on public.parking_sessions;
create policy "sessions_read_authorized"
on public.parking_sessions for select to authenticated
using (
  private.has_unit_role(unit_id, array['owner','manager','operator','finance','auditor']::public.app_role[])
  or private.customer_owns_vehicle(vehicle_id)
);

drop policy "payments_read_unit_staff" on public.payments;
drop policy "payments_read_customer_own" on public.payments;
create policy "payments_read_authorized"
on public.payments for select to authenticated
using (
  private.has_unit_role(unit_id, array['owner','manager','operator','finance','auditor']::public.app_role[])
  or private.customer_owns_session(parking_session_id)
);

drop policy "units_read_members" on public.parking_units;
drop policy "units_read_customer_session" on public.parking_units;
create policy "units_read_authorized"
on public.parking_units for select to authenticated
using (
  private.has_unit_role(id, array['owner','manager','operator','finance','auditor']::public.app_role[])
  or private.customer_has_unit_session(id)
);

