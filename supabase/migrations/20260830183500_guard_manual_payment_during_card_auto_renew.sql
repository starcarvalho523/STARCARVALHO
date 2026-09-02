create or replace function public.reserve_monthly_pix_payment(billing_period_id uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','auth'
as $function$
declare
  recurring_card_active boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  select coalesce(s.auto_renew,false)
         and coalesce(s.cancel_at_period_end,false)=false
         and coalesce(s.renewal_provider,'')='ASAAS'
         and coalesce(s.preferred_payment_method::text,'') in ('CREDIT_CARD','CARD')
    into recurring_card_active
    from public.monthly_billing_periods bp
    join public.monthly_subscriptions s on s.id=bp.subscription_id
   where bp.id=billing_period_id;

  if coalesce(recurring_card_active,false) then
    raise exception 'MONTHLY_AUTO_RENEW_ACTIVE' using errcode='23514';
  end if;

  return private.reserve_monthly_provider_payment(billing_period_id,'PIX','QR',request_key);
end
$function$;

create or replace function public.reserve_monthly_credit_checkout(billing_period_id uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','auth'
as $function$
declare
  recurring_card_active boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  select coalesce(s.auto_renew,false)
         and coalesce(s.cancel_at_period_end,false)=false
         and coalesce(s.renewal_provider,'')='ASAAS'
         and coalesce(s.preferred_payment_method::text,'') in ('CREDIT_CARD','CARD')
    into recurring_card_active
    from public.monthly_billing_periods bp
    join public.monthly_subscriptions s on s.id=bp.subscription_id
   where bp.id=billing_period_id;

  if coalesce(recurring_card_active,false) then
    raise exception 'MONTHLY_AUTO_RENEW_ACTIVE' using errcode='23514';
  end if;

  return private.reserve_monthly_provider_payment(billing_period_id,'CREDIT_CARD','HOSTED_CHECKOUT',request_key);
end
$function$;
