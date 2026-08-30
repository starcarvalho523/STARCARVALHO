begin;

revoke execute on function public.expire_monthly_credit_checkout_if_stale(uuid) from public, anon;
grant execute on function public.expire_monthly_credit_checkout_if_stale(uuid) to authenticated, service_role;

commit;
