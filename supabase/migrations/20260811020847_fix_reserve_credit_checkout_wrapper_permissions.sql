-- Allow authenticated operators to enter the privileged credit checkout
-- reservation flow without exposing its private implementation.
create or replace function public.reserve_credit_checkout(
  session_id uuid,
  request_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  return private.reserve_credit_checkout(session_id, request_key);
end
$$;

alter function public.reserve_credit_checkout(uuid, uuid) owner to postgres;

revoke all on function public.reserve_credit_checkout(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_credit_checkout(uuid, uuid)
  to authenticated;

revoke all on function private.reserve_credit_checkout(uuid, uuid)
  from public, anon, authenticated;
