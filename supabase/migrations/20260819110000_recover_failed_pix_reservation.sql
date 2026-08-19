create or replace function private.recover_failed_pix_reservation()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate_count integer;
  target_transaction_id uuid;
  target_payment_id uuid;
  target_session_id uuid;
  target_unit_id uuid;
begin
  select count(*)
    into candidate_count
    from private.payment_provider_transactions t
    join public.payments p on p.id = t.payment_id
    join public.parking_sessions s on s.id = p.parking_session_id
   where t.state = 'RECONCILIATION_FAILED'
     and t.environment = 'PRODUCTION'
     and t.provider_payment_id is null
     and t.provider_customer_id is null
     and t.failure_code = 'ASAAS_RECONCILIATION_NOT_FOUND'
     and p.method = 'PIX'
     and p.status = 'PENDING'
     and s.status = 'PAYMENT_PENDING'
     and s.payment_status = 'PENDING'
     and s.final_amount = 5.00;

  if candidate_count <> 1 then
    raise exception 'PIX_RECOVERY_CANDIDATE_COUNT_INVALID:%', candidate_count using errcode = 'P0001';
  end if;

  select t.id, p.id, s.id, s.unit_id
    into target_transaction_id, target_payment_id, target_session_id, target_unit_id
    from private.payment_provider_transactions t
    join public.payments p on p.id = t.payment_id
    join public.parking_sessions s on s.id = p.parking_session_id
   where t.state = 'RECONCILIATION_FAILED'
     and t.environment = 'PRODUCTION'
     and t.provider_payment_id is null
     and t.provider_customer_id is null
     and t.failure_code = 'ASAAS_RECONCILIATION_NOT_FOUND'
     and p.method = 'PIX'
     and p.status = 'PENDING'
     and s.status = 'PAYMENT_PENDING'
     and s.payment_status = 'PENDING'
     and s.final_amount = 5.00
   for update of t, p, s;

  perform pg_advisory_xact_lock(hashtextextended(target_session_id::text, 0));

  update private.payment_provider_transactions
     set state = 'EXPIRED',
         failure_code = 'RECOVERY_DISCARDED_NO_PROVIDER_CHARGE',
         failure_description = 'Discarded after verified provider-free reconciliation failure',
         updated_at = clock_timestamp()
   where id = target_transaction_id
     and provider_payment_id is null
     and provider_customer_id is null;

  if not found then
    raise exception 'PIX_RECOVERY_TRANSACTION_CHANGED' using errcode = '40001';
  end if;

  update public.payments
     set status = 'FAILED'
   where id = target_payment_id
     and status = 'PENDING';

  if not found then
    raise exception 'PIX_RECOVERY_PAYMENT_CHANGED' using errcode = '40001';
  end if;

  insert into public.audit_logs(unit_id, action, metadata)
  values (
    target_unit_id,
    'provider.pix.recovery_discarded',
    jsonb_build_object('session_id', target_session_id, 'transaction_id', target_transaction_id, 'reason', 'NO_PROVIDER_CHARGE')
  );

  return target_transaction_id;
end;
$$;

revoke all on function private.recover_failed_pix_reservation() from public, anon, authenticated;
grant execute on function private.recover_failed_pix_reservation() to service_role;

select private.recover_failed_pix_reservation();
