-- Defense in depth: remove PostgreSQL's default PUBLIC EXECUTE grant from
-- every existing function in the private schema. Anonymous/authenticated
-- callers already lack schema USAGE; this also prevents accidental exposure
-- if a future migration changes schema privileges.
revoke execute on all functions in schema private from public, anon, authenticated;
