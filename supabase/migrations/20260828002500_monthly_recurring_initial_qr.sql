alter table public.monthly_recurring_provider_bindings
  add column if not exists initial_qr_payload text,
  add column if not exists initial_qr_image_base64 text,
  add column if not exists initial_qr_expires_at timestamptz;

create or replace function public.save_monthly_recurring_initial_qr(
  target_subscription uuid,
  target_method text,
  qr_payload text,
  qr_image_base64 text,
  qr_expires_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if target_method not in ('PIX_AUTOMATIC','CREDIT_CARD') then
    raise exception 'INVALID_RECURRING_METHOD';
  end if;

  update public.monthly_recurring_provider_bindings
  set initial_qr_payload = qr_payload,
      initial_qr_image_base64 = qr_image_base64,
      initial_qr_expires_at = qr_expires_at,
      updated_at = now()
  where subscription_id = target_subscription
    and provider = 'ASAAS'
    and method = target_method;

  if not found then raise exception 'MONTHLY_RECURRING_BINDING_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.save_monthly_recurring_initial_qr(uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_monthly_recurring_initial_qr(uuid,text,text,text,timestamptz) to service_role;
