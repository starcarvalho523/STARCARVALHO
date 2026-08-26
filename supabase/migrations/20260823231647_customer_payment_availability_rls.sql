create policy "payment_availability_read_customer_session_unit"
on public.payment_method_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.parking_sessions s
    where s.unit_id = payment_method_availability.unit_id
      and private.customer_owns_session(s.id)
  )
);
