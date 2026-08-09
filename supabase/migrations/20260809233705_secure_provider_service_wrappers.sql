-- Backend-only wrappers cross into the closed private schema without granting schema access.
alter function public.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz) security definer;
alter function public.mark_provider_payment_failed(uuid,text) security definer;
alter function public.process_asaas_webhook(text,text,text,text,numeric,jsonb) security definer;

revoke all on function public.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz),
  public.mark_provider_payment_failed(uuid,text),public.process_asaas_webhook(text,text,text,text,numeric,jsonb)
  from public,anon,authenticated;
grant execute on function public.mark_provider_payment_created(uuid,text,text,text,text,text,text,timestamptz),
  public.mark_provider_payment_failed(uuid,text),public.process_asaas_webhook(text,text,text,text,numeric,jsonb)
  to service_role;
