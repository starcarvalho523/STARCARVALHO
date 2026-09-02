begin;

revoke execute on function public.expire_monthly_credit_checkout_if_stale(uuid) from anon;
grant execute on function public.expire_monthly_credit_checkout_if_stale(uuid) to authenticated, service_role;

revoke execute on function public.mark_monthly_payment_preference_from_paid_payment() from public, anon, authenticated;
grant execute on function public.mark_monthly_payment_preference_from_paid_payment() to service_role;

create index if not exists monthly_recurring_provider_bindings_initial_period_idx
  on public.monthly_recurring_provider_bindings(initial_billing_period_id);

commit;
