drop policy if exists payment_availability_read_customer_monthly_unit
on public.payment_method_availability;

create policy payment_availability_read_customer_monthly_unit
on public.payment_method_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.monthly_subscriptions ms
    where ms.unit_id = payment_method_availability.unit_id
      and ms.customer_id = (select auth.uid())
      and ms.status in ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED')
  )
);
