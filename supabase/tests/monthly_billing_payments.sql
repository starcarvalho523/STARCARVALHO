begin;
do $$
declare historical_count integer; historical_fingerprint text;
begin
  select count(*),md5(string_agg(id::text||':'||parking_session_id::text||':'||amount::text||':'||method::text||':'||status::text||':'||payment_channel::text||':'||coalesce(provider,''),',' order by id))
  into historical_count,historical_fingerprint from public.payments where payment_subject_type='PARKING_SESSION';
  assert historical_count=7,'seven historical payments must remain';
  assert not exists(select 1 from public.payments where payment_subject_type='PARKING_SESSION' and parking_session_id is null);
  assert not exists(select 1 from public.payments where payment_subject_type='MONTHLY_BILLING_PERIOD' and monthly_billing_period_id is null);
  assert exists(select 1 from pg_indexes where indexname='payments_one_current_per_session_idx');
  assert exists(select 1 from pg_indexes where indexname='payments_one_current_per_monthly_period_idx');
  assert has_function_privilege('authenticated','public.reserve_monthly_pix_payment(uuid,uuid)','execute');
  assert not has_function_privilege('authenticated','private.reserve_monthly_provider_payment(uuid,parking_payment_method,payment_channel,uuid)','execute');
  assert not has_function_privilege('anon','public.reserve_monthly_pix_payment(uuid,uuid)','execute');
  assert has_function_privilege('service_role','public.confirm_provider_payment_subject(uuid,boolean)','execute');
end $$;
rollback;
