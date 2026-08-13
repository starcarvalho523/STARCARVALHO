select private.generate_current_monthly_billing_periods_for_unit(
  :'unit_id'::uuid, :'target_day'::date, false, 'CRON', null
);
