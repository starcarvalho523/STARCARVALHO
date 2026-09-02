-- Harden private monthly recurring/cycle helpers: they are internal implementation details
-- and must not inherit PostgreSQL's default EXECUTE grant to PUBLIC.

revoke execute on function private.process_asaas_monthly_recurring_payment_webhook(text,text,text,text,text,numeric,date,text,jsonb)
  from public, anon, authenticated;

revoke execute on function private.monthly_cycle_next_date(date)
  from public, anon, authenticated;

revoke execute on function private.monthly_cycle_end(date)
  from public, anon, authenticated;

revoke execute on function private.enforce_monthly_thirty_day_next_billing_date()
  from public, anon, authenticated;

revoke execute on function private.normalize_monthly_thirty_day_after_period_paid()
  from public, anon, authenticated;
