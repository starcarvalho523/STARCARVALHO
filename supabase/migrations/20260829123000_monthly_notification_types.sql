alter table public.customer_notifications
  drop constraint if exists customer_notifications_type_check;

alter table public.customer_notifications
  add constraint customer_notifications_type_check
  check (type in (
    'PARKING_PRICE_UPCOMING',
    'PARKING_PRICE_UPDATED',
    'GRACE_ENDING',
    'GRACE_ENDED',
    'DAILY_CAP_NEAR',
    'DAILY_CAP_REACHED',
    'MONTHLY_PAYMENT_DUE',
    'MONTHLY_PAYMENT_OVERDUE',
    'MONTHLY_ACTIVATED',
    'MONTHLY_REACTIVATED',
    'MONTHLY_SUSPENDED',
    'MONTHLY_DUE_SOON',
    'MONTHLY_DUE_TODAY',
    'MONTHLY_GRACE_LAST_DAY',
    'MONTHLY_VEHICLE_COVERAGE_ACTIVE',
    'PAYMENT_CONFIRMED'
  ));
