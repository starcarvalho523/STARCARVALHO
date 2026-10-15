begin;

create or replace function public.record_asaas_payment_financials(
  target_provider_payment_id text,
  target_gross numeric,
  target_net numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if target_provider_payment_id is null or btrim(target_provider_payment_id) = '' then
    raise exception 'ASAAS_PAYMENT_ID_REQUIRED';
  end if;
  if target_gross is null or target_net is null or target_gross < 0 or target_net < 0 or target_net > target_gross then
    raise exception 'ASAAS_FINANCIAL_VALUES_INVALID';
  end if;

  update public.payments
     set gross_amount = round(target_gross, 2),
         net_amount = round(target_net, 2),
         fee_amount = round(target_gross - target_net, 2)
   where provider = 'ASAAS'
     and provider_reference = target_provider_payment_id;

  get diagnostics affected = row_count;
  return jsonb_build_object('updated', affected);
end;
$$;

revoke all on function public.record_asaas_payment_financials(text,numeric,numeric) from public, anon, authenticated;
grant execute on function public.record_asaas_payment_financials(text,numeric,numeric) to service_role;

commit;
