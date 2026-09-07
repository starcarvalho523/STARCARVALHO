-- Compatibility patch after private-schema hardening.
-- parking_units SELECT policies invoke this SECURITY DEFINER helper for customer access.
-- Without EXECUTE, PostgreSQL may fail the whole policy expression even for an owner
-- whose has_unit_role(...) branch is true.

grant usage on schema private to authenticated;
grant execute on function private.customer_has_unit_session(uuid) to authenticated;
