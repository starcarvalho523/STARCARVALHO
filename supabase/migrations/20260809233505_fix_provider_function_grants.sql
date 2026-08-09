-- Public security-invoker wrappers need execute on their validated private targets.
grant execute on function private.reserve_pix_payment(uuid,uuid),private.get_provider_payment(uuid) to authenticated;
grant execute on function private.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz),
  private.mark_provider_payment_failed(uuid,text),private.process_asaas_webhook(text,text,text,text,numeric,jsonb)
  to service_role;
