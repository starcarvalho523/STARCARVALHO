-- Expose checkout status through a narrowly authorized read-only wrapper.
create or replace function public.get_credit_checkout(session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  -- Verifies the session, its unit membership and the configured payment method.
  perform private.authorize_credit_checkout(session_id);
  return private.get_credit_checkout(session_id);
end
$$;

alter function public.get_credit_checkout(uuid) owner to postgres;

revoke all on function public.get_credit_checkout(uuid)
  from public, anon, authenticated;
grant execute on function public.get_credit_checkout(uuid)
  to authenticated;

revoke all on function private.get_credit_checkout(uuid)
  from public, anon, authenticated;
