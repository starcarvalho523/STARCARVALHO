create or replace function public.bind_payment_provider_customer(
  customer_user_id uuid,
  target_provider text,
  target_environment text,
  target_provider_customer_id text,
  target_external_reference text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  bound_id text;
begin
  if target_provider <> 'ASAAS' then
    raise exception 'PAYMENT_PROVIDER_UNSUPPORTED' using errcode = '22023';
  end if;
  if target_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'PAYMENT_PROVIDER_ENVIRONMENT_INVALID' using errcode = '22023';
  end if;
  if target_provider_customer_id is null or btrim(target_provider_customer_id) = '' then
    raise exception 'PAYMENT_PROVIDER_CUSTOMER_ID_REQUIRED' using errcode = '22023';
  end if;

  insert into private.payment_provider_customers as provider_customer (
    provider, environment, customer_user_id, provider_customer_id, external_reference
  ) values (
    target_provider, target_environment, customer_user_id, target_provider_customer_id, target_external_reference
  )
  on conflict on constraint payment_provider_customers_pkey
  do update set
    provider_customer_id = excluded.provider_customer_id,
    external_reference = excluded.external_reference,
    updated_at = now()
  returning provider_customer.provider_customer_id into bound_id;

  return bound_id;
end;
$$;

revoke all on function public.bind_payment_provider_customer(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bind_payment_provider_customer(uuid, text, text, text, text) to service_role;
