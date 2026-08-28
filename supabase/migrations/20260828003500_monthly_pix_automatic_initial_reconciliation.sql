alter table public.monthly_recurring_provider_bindings
  add column if not exists initial_billing_period_id uuid references public.monthly_billing_periods(id) on delete restrict,
  add column if not exists initial_conciliation_identifier text;

create unique index if not exists monthly_recurring_provider_bindings_initial_conciliation_uidx
  on public.monthly_recurring_provider_bindings(provider, initial_conciliation_identifier)
  where initial_conciliation_identifier is not null;

create or replace function public.bind_monthly_pix_automatic_initial_payment(
  target_subscription uuid,
  target_billing_period uuid,
  target_conciliation_identifier text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'MONTHLY_RECURRING_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if target_conciliation_identifier is null or btrim(target_conciliation_identifier) = '' then
    raise exception 'MONTHLY_RECURRING_CONCILIATION_REQUIRED';
  end if;
  if not exists (
    select 1 from public.monthly_billing_periods bp
    where bp.id=target_billing_period and bp.subscription_id=target_subscription
  ) then
    raise exception 'MONTHLY_RECURRING_PERIOD_MISMATCH';
  end if;
  update public.monthly_recurring_provider_bindings
     set initial_billing_period_id=target_billing_period,
         initial_conciliation_identifier=target_conciliation_identifier,
         updated_at=clock_timestamp()
   where subscription_id=target_subscription
     and provider='ASAAS'
     and method='PIX_AUTOMATIC';
  if not found then raise exception 'MONTHLY_RECURRING_BINDING_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.bind_monthly_pix_automatic_initial_payment(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.bind_monthly_pix_automatic_initial_payment(uuid,uuid,text) to service_role;

create or replace function public.process_monthly_pix_automatic_initial_payment(
  event_id text,
  event_type text,
  provider_payment_id text,
  provider_customer_id text,
  provider_status text,
  reported_amount numeric,
  conciliation_identifier text,
  provider_environment text,
  sanitized_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  binding public.monthly_recurring_provider_bindings;
  period_row public.monthly_billing_periods;
  existing_payment public.payments;
  new_payment_id uuid;
  transaction_id uuid;
  result jsonb;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'MONTHLY_RECURRING_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if event_id is null or provider_payment_id is null or conciliation_identifier is null then
    raise exception 'MONTHLY_RECURRING_INITIAL_EVENT_INVALID';
  end if;
  if provider_environment not in ('SANDBOX','PRODUCTION') then
    raise exception 'PAYMENT_PROVIDER_ENVIRONMENT_INVALID';
  end if;

  select * into binding
    from public.monthly_recurring_provider_bindings b
   where b.provider='ASAAS'
     and b.method='PIX_AUTOMATIC'
     and b.initial_conciliation_identifier=conciliation_identifier
   for update;
  if not found then return jsonb_build_object('result','unknown'); end if;
  if binding.initial_billing_period_id is null then return jsonb_build_object('result','review'); end if;

  select * into period_row
    from public.monthly_billing_periods
   where id=binding.initial_billing_period_id
   for update;
  if not found then return jsonb_build_object('result','review'); end if;
  if reported_amount is null or reported_amount<>period_row.amount then
    update public.monthly_billing_periods set status='MANUAL_REVIEW',updated_at=clock_timestamp()
     where id=period_row.id and status='PENDING';
    return jsonb_build_object('result','review');
  end if;

  select * into existing_payment
    from public.payments
   where monthly_billing_period_id=period_row.id and status in ('PENDING','PAID')
   order by created_at asc limit 1
   for update;

  if found then
    if existing_payment.provider_reference is not null and existing_payment.provider_reference<>provider_payment_id then
      return jsonb_build_object('result','review');
    end if;
  else
    new_payment_id:=gen_random_uuid();
    transaction_id:=gen_random_uuid();
    insert into public.payments(
      id,unit_id,parking_session_id,monthly_billing_period_id,payment_subject_type,
      amount,gross_amount,method,status,provider,payment_channel,manual_confirmation,
      idempotency_key,provider_reference,provider_environment
    ) values (
      new_payment_id,period_row.unit_id,null,period_row.id,'MONTHLY_BILLING_PERIOD',
      period_row.amount,period_row.amount,'PIX','PENDING','ASAAS','QR',false,
      gen_random_uuid(),provider_payment_id,provider_environment
    );
    insert into private.payment_provider_transactions(
      id,payment_id,provider,environment,state,provider_payment_id,provider_customer_id,
      provider_status,external_reference,updated_at
    ) values (
      transaction_id,new_payment_id,'ASAAS',provider_environment,'PENDING',provider_payment_id,provider_customer_id,
      provider_status,'starcarvalhos:monthly:auto:'||period_row.id::text,clock_timestamp()
    );
  end if;

  result:=private.process_asaas_webhook(
    event_id,event_type,provider_payment_id,provider_status,reported_amount,coalesce(sanitized_payload,'{}'::jsonb)
  );
  return result;
end;
$$;

revoke all on function public.process_monthly_pix_automatic_initial_payment(text,text,text,text,text,numeric,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.process_monthly_pix_automatic_initial_payment(text,text,text,text,text,numeric,text,text,jsonb) to service_role;
