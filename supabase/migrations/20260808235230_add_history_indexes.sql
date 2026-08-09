create index if not exists parking_sessions_unit_entered_history_idx
  on public.parking_sessions (unit_id, entered_at desc);

create index if not exists parking_sessions_unit_exited_history_idx
  on public.parking_sessions (unit_id, exited_at desc)
  where exited_at is not null;

create index if not exists parking_sessions_unit_status_entered_idx
  on public.parking_sessions (unit_id, status, entered_at desc);

create index if not exists parking_sessions_unit_plate_history_idx
  on public.parking_sessions (unit_id, plate_snapshot text_pattern_ops, entered_at desc);

create policy "vehicles_read_customer_own"
on public.vehicles for select to authenticated
using (customer_id = (select auth.uid()));

create policy "sessions_read_customer_own"
on public.parking_sessions for select to authenticated
using (exists (
  select 1 from public.vehicles
  where vehicles.id = parking_sessions.vehicle_id
    and vehicles.customer_id = (select auth.uid())
));

create policy "payments_read_customer_own"
on public.payments for select to authenticated
using (exists (
  select 1 from public.parking_sessions
  join public.vehicles on vehicles.id = parking_sessions.vehicle_id
  where parking_sessions.id = payments.parking_session_id
    and vehicles.customer_id = (select auth.uid())
));

create policy "units_read_customer_session"
on public.parking_units for select to authenticated
using (exists (
  select 1 from public.parking_sessions
  join public.vehicles on vehicles.id = parking_sessions.vehicle_id
  where parking_sessions.unit_id = parking_units.id
    and vehicles.customer_id = (select auth.uid())
));

