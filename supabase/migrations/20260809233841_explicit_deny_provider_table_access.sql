create policy "provider_transactions_deny_direct_access"
on private.payment_provider_transactions for all to authenticated
using (false) with check (false);

create policy "provider_events_deny_direct_access"
on private.payment_provider_events for all to authenticated
using (false) with check (false);
