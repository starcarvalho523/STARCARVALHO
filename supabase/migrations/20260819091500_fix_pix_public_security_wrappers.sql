-- Align PIX public RPC wrappers with the private security model used by credit checkout.
-- Authenticated callers may execute only the public wrapper; authorization remains inside private functions.

create or replace function public.reserve_pix_payment(session_id uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  return private.reserve_pix_payment(session_id, request_key);
end
$$;

create or replace function public.get_provider_payment(session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  return private.get_provider_payment(session_id);
end
$$;

revoke all on function public.reserve_pix_payment(uuid,uuid) from public,anon;
revoke all on function public.get_provider_payment(uuid) from public,anon;
grant execute on function public.reserve_pix_payment(uuid,uuid) to authenticated;
grant execute on function public.get_provider_payment(uuid) to authenticated;
