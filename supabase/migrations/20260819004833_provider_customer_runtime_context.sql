-- Resolve a payment subject's actual customer without exposing provider tables to browser roles.
create or replace function private.get_provider_customer_context(target_transaction uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  transaction_row private.payment_provider_transactions;
  payment_row public.payments;
  customer_id uuid;
  customer_name text;
  customer_document text;
  existing_provider_customer text;
begin
  select * into transaction_row from private.payment_provider_transactions where id = target_transaction;
  if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND'; end if;
  select * into payment_row from public.payments where id = transaction_row.payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if payment_row.payment_subject_type = 'PARKING_SESSION' then
    select s.customer_owner_id into customer_id from public.parking_sessions s where s.id = payment_row.parking_session_id;
  else
    select subscription.customer_id into customer_id from public.monthly_billing_periods period join public.monthly_subscriptions subscription on subscription.id = period.subscription_id where period.id = payment_row.monthly_billing_period_id;
  end if;
  if customer_id is null then raise exception 'PAYMENT_CUSTOMER_REQUIRED'; end if;
  select full_name, billing_document into customer_name, customer_document from public.customer_profiles where user_id = customer_id;
  if customer_name is null or btrim(customer_name) = '' then raise exception 'PAYMENT_CUSTOMER_PROFILE_REQUIRED'; end if;
  select provider_customer_id into existing_provider_customer from private.payment_provider_customers where provider = 'ASAAS' and environment = transaction_row.environment and customer_user_id = customer_id;
  return jsonb_build_object('customerUserId', customer_id, 'fullName', customer_name, 'billingDocument', customer_document, 'providerCustomerId', existing_provider_customer, 'environment', transaction_row.environment);
end
$$;
create or replace function public.get_provider_customer_context(transaction_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$ select private.get_provider_customer_context(transaction_id) $$;
revoke all on function private.get_provider_customer_context(uuid) from public, anon, authenticated;
revoke all on function public.get_provider_customer_context(uuid) from public, anon, authenticated;
grant execute on function public.get_provider_customer_context(uuid) to service_role;;
