-- Server-only customer context for the provider transaction created before an Asaas PIX charge.
create or replace function private.get_provider_customer_context(target_transaction uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $$
declare t private.payment_provider_transactions; p public.payments; customer_id uuid; customer_name text; customer_document text; existing_provider_customer text;
begin
  select * into t from private.payment_provider_transactions where id=target_transaction;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into p from public.payments where id=t.payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.payment_subject_type='PARKING_SESSION' then
    select customer_owner_id into customer_id from public.parking_sessions where id=p.parking_session_id;
  else
    select s.customer_id into customer_id from public.monthly_billing_periods b join public.monthly_subscriptions s on s.id=b.subscription_id where b.id=p.monthly_billing_period_id;
  end if;
  if customer_id is null then raise exception 'PAYMENT_CUSTOMER_REQUIRED'; end if;
  select full_name,billing_document into customer_name,customer_document from public.customer_profiles where user_id=customer_id;
  if customer_name is null or btrim(customer_name)='' then raise exception 'PAYMENT_CUSTOMER_PROFILE_REQUIRED'; end if;
  select provider_customer_id into existing_provider_customer from private.payment_provider_customers where provider='ASAAS' and environment=t.environment and customer_user_id=customer_id;
  return jsonb_build_object('customerUserId',customer_id,'fullName',customer_name,'billingDocument',customer_document,'providerCustomerId',existing_provider_customer,'environment',t.environment);
end $$;

create or replace function public.get_provider_customer_context(transaction_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,private
as $$ select private.get_provider_customer_context(transaction_id) $$;

revoke all on function private.get_provider_customer_context(uuid) from public,anon,authenticated;
revoke all on function public.get_provider_customer_context(uuid) from public,anon,authenticated;
grant execute on function public.get_provider_customer_context(uuid) to service_role;
