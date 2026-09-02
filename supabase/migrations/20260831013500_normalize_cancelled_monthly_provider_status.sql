update private.payment_provider_transactions t
set provider_status = 'CANCELLED',
    updated_at = clock_timestamp()
from public.payments p
where t.payment_id = p.id
  and p.monthly_billing_period_id is not null
  and p.status = 'CANCELLED'
  and t.state = 'CANCELLED'
  and coalesce(t.provider_status, '') <> 'CANCELLED';
