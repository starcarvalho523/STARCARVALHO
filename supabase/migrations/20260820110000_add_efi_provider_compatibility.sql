alter table private.payment_provider_transactions
  drop constraint payment_provider_transactions_provider_check;

alter table private.payment_provider_transactions
  add constraint payment_provider_transactions_provider_check
  check (provider in ('ASAAS', 'EFI', 'MERCADO_PAGO'));

alter table public.payment_method_availability
  drop constraint payment_method_availability_payment_provider_check;

alter table public.payment_method_availability
  add constraint payment_method_availability_payment_provider_check
  check (payment_provider in ('INTERNAL', 'ASAAS', 'EFI', 'MERCADO_PAGO'));

alter table public.payments
  drop constraint payments_provider_known_check;

alter table public.payments
  add constraint payments_provider_known_check
  check (
    provider is null
    or provider in ('INTERNAL', 'ASAAS', 'EFI', 'MERCADO_PAGO')
  );
