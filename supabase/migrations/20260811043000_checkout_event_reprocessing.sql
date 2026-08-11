
create or replace function private.get_checkout_payment_events_for_reprocessing(target_session_id uuid, target_event_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.provider_event_id,
    'type', e.event_type,
    'paymentId', e.provider_payment_id,
    'paymentStatus', e.provider_status,
    'amount', (e.sanitized_payload ->> 'value')::numeric,
    'billingType', e.sanitized_payload ->> 'billingType',
    'externalReference', nullif(e.sanitized_payload ->> 'externalReference', '')
  ) order by case e.event_type when 'PAYMENT_CREATED' then 0 else 1 end, e.received_at), '[]'::jsonb)
  from public.payments p
  join private.payment_provider_transactions t on t.payment_id = p.id
  join private.payment_provider_events e
    on e.provider = 'ASAAS'
   and e.provider_payment_id is not null
   and e.event_type in ('PAYMENT_CREATED','PAYMENT_CONFIRMED')
   and e.provider_event_id = any(target_event_ids)
   and e.processing_status in ('IGNORED','REVIEW')
   and (e.sanitized_payload ->> 'value')::numeric = p.amount
   and e.sanitized_payload ->> 'billingType' = 'CREDIT_CARD'
  where p.parking_session_id = target_session_id
    and p.method = 'CREDIT_CARD'
    and p.payment_channel = 'HOSTED_CHECKOUT'
    and p.provider = 'ASAAS'
    and p.status = 'PENDING'
    and t.state = 'PENDING'
    and t.provider_checkout_id is not null
$$;

create or replace function public.get_checkout_payment_events_for_reprocessing(session_id uuid, event_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$ select private.get_checkout_payment_events_for_reprocessing(session_id, event_ids) $$;

alter function public.get_checkout_payment_events_for_reprocessing(uuid,text[]) owner to postgres;

revoke all on function private.get_checkout_payment_events_for_reprocessing(uuid,text[])
  from public, anon, authenticated;
revoke all on function public.get_checkout_payment_events_for_reprocessing(uuid,text[])
  from public, anon, authenticated;
grant execute on function public.get_checkout_payment_events_for_reprocessing(uuid,text[])
  to service_role;