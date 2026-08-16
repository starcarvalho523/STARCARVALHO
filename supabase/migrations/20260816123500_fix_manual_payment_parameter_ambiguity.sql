create or replace function public.record_manual_payment(
  session_id uuid,
  payment_method public.parking_payment_method,
  request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  s public.parking_sessions;
  actor uuid;
  shift public.cash_shifts;
  payment_id uuid;
  target_method alias for $2;
begin
  if target_method not in ('CASH','CARD') then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE';
  end if;

  select * into s
  from public.parking_sessions
  where id=session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode='P0002';
  end if;

  actor:=private.require_operator(s.unit_id);

  if not exists(
    select 1
    from public.payment_method_availability a
    where a.unit_id=s.unit_id
      and a.payment_method=target_method::text
      and a.payment_channel='MANUAL'
      and a.payment_provider='INTERNAL'
      and a.enabled
      and a.configuration_state='READY'
  ) then
    raise exception 'PAYMENT_METHOD_NOT_AVAILABLE';
  end if;

  if s.status='PAID' then
    select id into payment_id
    from public.payments
    where parking_session_id=s.id and status='PAID';
    return payment_id;
  end if;

  if s.status<>'PAYMENT_PENDING' then
    raise exception 'EXIT_NOT_STARTED';
  end if;

  select * into shift
  from public.cash_shifts
  where unit_id=s.unit_id
    and operator_id=actor
    and status='OPEN'
  for update;

  if not found then
    raise exception 'CASH_SHIFT_REQUIRED';
  end if;

  insert into public.payments(
    unit_id,parking_session_id,amount,method,status,provider,payment_channel,
    manual_confirmation,paid_at,received_by,cash_shift_id,idempotency_key
  ) values(
    s.unit_id,s.id,s.final_amount,target_method,'PAID','INTERNAL','MANUAL',
    true,clock_timestamp(),actor,shift.id,request_key
  )
  on conflict(idempotency_key) do nothing
  returning id into payment_id;

  if payment_id is null then
    select id into payment_id
    from public.payments
    where idempotency_key=request_key and parking_session_id=s.id;
    if payment_id is null then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
  end if;

  update public.parking_sessions
  set status='PAID',payment_status='PAID',updated_at=clock_timestamp()
  where id=s.id and status='PAYMENT_PENDING';

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(
    actor,s.unit_id,'payment.manual_confirmed',
    jsonb_build_object(
      'session_id',s.id,
      'payment_id',payment_id,
      'method',target_method,
      'channel','MANUAL',
      'provider','INTERNAL'
    )
  );

  return payment_id;
end
$$;
