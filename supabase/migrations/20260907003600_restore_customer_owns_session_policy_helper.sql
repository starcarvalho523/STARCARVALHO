-- Compatibility patch after private-schema hardening.
-- payments_read_authorized invokes this SECURITY DEFINER helper in one OR branch.
-- PostgreSQL may evaluate that branch even for staff users authorized by has_unit_role(...).

grant usage on schema private to authenticated;
grant execute on function private.customer_owns_session(uuid) to authenticated;
