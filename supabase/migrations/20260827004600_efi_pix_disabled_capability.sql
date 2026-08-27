insert into public.payment_method_availability(
  unit_id,payment_method,payment_channel,payment_provider,
  enabled,configuration_state,legacy
)
select id,'PIX','QR','EFI',false,'UNCONFIGURED',false
from public.parking_units
on conflict (unit_id,payment_method,payment_channel,payment_provider) do nothing;
