-- Security hardening: authenticated/anon callers must never reach private internals directly.
-- Public SECURITY DEFINER wrappers and triggers continue to execute with the function owner's privileges.

revoke usage on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;
revoke execute on all functions in schema private from anon, authenticated;

alter default privileges in schema private revoke all on tables from anon, authenticated;
alter default privileges in schema private revoke all on sequences from anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
