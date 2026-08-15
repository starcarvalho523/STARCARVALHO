-- Remove the legacy vehicle-current-owner policy after customer_owner_id becomes
-- the immutable ownership snapshot for parking-session reads.
drop policy if exists sessions_read_authorized on public.parking_sessions;

-- The replacement is intentionally idempotent and uses the session snapshot.
drop policy if exists parking_sessions_read_authorized on public.parking_sessions;
create policy parking_sessions_read_authorized on public.parking_sessions
for select to authenticated using (
  private.has_unit_role(
    unit_id,
    array['owner','manager','operator','finance','auditor']::public.app_role[]
  )
  or customer_owner_id = (select auth.uid())
);
