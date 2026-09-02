create table if not exists public.monthly_automation_incidents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  incident_key text not null unique,
  code text not null,
  severity text not null default 'ATTENTION' check (severity in ('ATTENTION','CRITICAL')),
  summary text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  occurrences integer not null default 1 check (occurrences > 0)
);

create index if not exists monthly_automation_incidents_unit_status_idx
  on public.monthly_automation_incidents(unit_id,status,last_seen_at desc);

alter table public.monthly_automation_incidents enable row level security;
revoke all on table public.monthly_automation_incidents from public, anon, authenticated;
grant select,insert,update on table public.monthly_automation_incidents to service_role;

create or replace function public.record_monthly_automation_incident(
  target_unit uuid,
  target_key text,
  target_code text,
  target_summary text,
  target_severity text default 'ATTENTION'
) returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501'; end if;
  if target_unit is null or target_key is null or btrim(target_key)='' or target_code is null or target_severity not in ('ATTENTION','CRITICAL') then
    raise exception 'MONTHLY_INCIDENT_INVALID';
  end if;
  insert into public.monthly_automation_incidents(unit_id,incident_key,code,severity,summary)
  values(target_unit,btrim(target_key),left(target_code,80),target_severity,left(coalesce(target_summary,target_code),240))
  on conflict(incident_key) do update set
    code=excluded.code,severity=excluded.severity,summary=excluded.summary,status='OPEN',resolved_at=null,
    last_seen_at=clock_timestamp(),occurrences=public.monthly_automation_incidents.occurrences+1;
end;
$$;

create or replace function public.resolve_monthly_automation_incident(target_key text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'MONTHLY_CRON_FORBIDDEN' using errcode='42501'; end if;
  update public.monthly_automation_incidents set status='RESOLVED',resolved_at=clock_timestamp(),last_seen_at=clock_timestamp()
   where incident_key=target_key and status='OPEN';
end;
$$;

create or replace function public.list_monthly_automation_incidents_for_actor()
returns table(id uuid,unit_id uuid,code text,severity text,summary text,last_seen_at timestamptz,occurrences integer)
language sql
stable
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select i.id,i.unit_id,i.code,i.severity,i.summary,i.last_seen_at,i.occurrences
    from public.monthly_automation_incidents i
   where auth.uid() is not null
     and i.status='OPEN'
     and private.has_unit_role(i.unit_id,array['owner','manager','finance','auditor']::public.app_role[])
   order by case i.severity when 'CRITICAL' then 0 else 1 end,i.last_seen_at desc
   limit 100
$$;

revoke all on function public.record_monthly_automation_incident(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.resolve_monthly_automation_incident(text) from public,anon,authenticated;
revoke all on function public.list_monthly_automation_incidents_for_actor() from public,anon;
grant execute on function public.record_monthly_automation_incident(uuid,text,text,text,text) to service_role;
grant execute on function public.resolve_monthly_automation_incident(text) to service_role;
grant execute on function public.list_monthly_automation_incidents_for_actor() to authenticated;

drop function if exists public.list_monthly_asaas_reconciliation_candidates();
create function public.list_monthly_asaas_reconciliation_candidates()
returns table(
  payment_id uuid,
  unit_id uuid,
  provider_payment_id text,
  provider_status text,
  amount numeric,
  external_reference text
)
language sql
security definer
set search_path=pg_catalog,public,private,auth
as $$
  select p.id,p.unit_id,t.provider_payment_id,t.provider_status,p.amount,t.external_reference
    from public.payments p
    join private.payment_provider_transactions t on t.payment_id=p.id
   where (select auth.role())='service_role'
     and p.payment_subject_type='MONTHLY_BILLING_PERIOD'
     and p.provider='ASAAS'
     and p.status='PENDING'
     and t.provider='ASAAS'
     and t.provider_payment_id is not null
   order by p.created_at asc
   limit 500
$$;
revoke all on function public.list_monthly_asaas_reconciliation_candidates() from public,anon,authenticated;
grant execute on function public.list_monthly_asaas_reconciliation_candidates() to service_role;
