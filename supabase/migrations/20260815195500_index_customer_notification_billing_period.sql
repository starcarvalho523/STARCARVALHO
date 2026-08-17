-- Cover the monthly billing period foreign key used by customer notifications.
create index if not exists customer_notifications_monthly_billing_period_idx
  on public.customer_notifications(monthly_billing_period_id)
  where monthly_billing_period_id is not null;
