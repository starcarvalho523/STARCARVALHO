create or replace function public.list_ignored_monthly_renewal_events(target_since timestamptz default (clock_timestamp() - interval '2 hours'))
returns table(
  id bigint,
  provider_event_id text,
  provider_payment_id text,
  sanitized_payload jsonb
)
language sql
security definer
set search_path to 'pg_catalog','public','private'
as $$
  select e.id,e.provider_event_id,e.provider_payment_id,e.sanitized_payload
  from private.payment_provider_events e
  where e.provider='ASAAS'
    and e.event_type='PAYMENT_CREATED'
    and e.processing_status='IGNORED'
    and e.received_at>=target_since
  order by e.received_at desc
  limit 20;
$$;

revoke all on function public.list_ignored_monthly_renewal_events(timestamptz) from public, anon, authenticated;
grant execute on function public.list_ignored_monthly_renewal_events(timestamptz) to service_role;

create or replace function public.mark_ignored_monthly_renewal_event_processed(target_event_id bigint)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
begin
  update private.payment_provider_events
     set processing_status='PROCESSED',processed_at=clock_timestamp()
   where id=target_event_id
     and provider='ASAAS'
     and event_type='PAYMENT_CREATED'
     and processing_status='IGNORED';
  return found;
end;
$$;

revoke all on function public.mark_ignored_monthly_renewal_event_processed(bigint) from public, anon, authenticated;
grant execute on function public.mark_ignored_monthly_renewal_event_processed(bigint) to service_role;
