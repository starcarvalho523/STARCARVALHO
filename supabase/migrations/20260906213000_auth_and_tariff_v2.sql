-- Operação Comercial 2.0 — integridade e Tarifa 2.0

-- As policies RLS chamam private.has_unit_role como authenticated.
-- O hardening de 20260906131500/132500 removeu esse acesso por engano.
-- Reabrimos somente o mínimo necessário; as demais funções privadas seguem bloqueadas.
grant usage on schema private to authenticated;
grant execute on function private.has_unit_role(uuid, public.app_role[]) to authenticated;

alter table public.tariff_rules
  add column if not exists intermediate_cap_amount numeric(12,2)
    check (intermediate_cap_amount is null or intermediate_cap_amount > 0),
  add column if not exists intermediate_after_minutes integer
    check (intermediate_after_minutes is null or intermediate_after_minutes > 0),
  add column if not exists exit_grace_minutes integer not null default 10
    check (exit_grace_minutes between 0 and 120),
  add column if not exists daily_cycle_minutes integer not null default 1440
    check (daily_cycle_minutes between 60 and 10080);

alter table public.tariff_rules drop constraint if exists tariff_rules_intermediate_pair_check;
alter table public.tariff_rules add constraint tariff_rules_intermediate_pair_check check (
  (intermediate_cap_amount is null and intermediate_after_minutes is null)
  or (intermediate_cap_amount is not null and intermediate_after_minutes is not null)
);

create or replace function private.charge_amount(snapshot jsonb, entered timestamptz, reference_time timestamptz)
returns numeric language plpgsql immutable set search_path=pg_catalog as $$
declare
  mins integer := greatest(0,ceil(extract(epoch from(reference_time-entered))/60)::integer);
  grace_mins integer := coalesce(nullif(snapshot->>'grace_minutes','')::integer,0);
  first_hour numeric := coalesce(nullif(snapshot->>'first_hour_amount','')::numeric,0);
  additional numeric := coalesce(nullif(snapshot->>'additional_amount','')::numeric,0);
  fraction integer := greatest(1,coalesce(nullif(snapshot->>'additional_fraction_minutes','')::integer,60));
  daily_cap numeric := nullif(snapshot->>'daily_cap_amount','')::numeric;
  daily_after integer := nullif(snapshot->>'daily_after_minutes','')::integer;
  intermediate_cap numeric := nullif(snapshot->>'intermediate_cap_amount','')::numeric;
  intermediate_after integer := nullif(snapshot->>'intermediate_after_minutes','')::integer;
  cycle_mins integer := greatest(60,coalesce(nullif(snapshot->>'daily_cycle_minutes','')::integer,1440));
  completed_cycles integer := 0;
  remaining integer;
  cycle_total numeric := 0;
  total numeric := 0;
begin
  if mins<=grace_mins then return 0; end if;

  if daily_cap is not null and mins>=cycle_mins then
    completed_cycles:=floor(mins::numeric/cycle_mins)::integer;
    remaining:=mod(mins,cycle_mins);
    total:=completed_cycles*daily_cap;
    if remaining=0 then return round(total,2); end if;
  else
    remaining:=mins;
  end if;

  if remaining<=grace_mins then
    cycle_total:=0;
  else
    cycle_total:=first_hour;
    if remaining>60 then
      cycle_total:=cycle_total+ceil((remaining-60)::numeric/fraction)*additional;
    end if;
    if intermediate_cap is not null and intermediate_after is not null and remaining>=intermediate_after then
      cycle_total:=least(cycle_total,intermediate_cap);
    end if;
    if daily_cap is not null then
      if daily_after is not null and remaining>=daily_after then cycle_total:=daily_cap;
      else cycle_total:=least(cycle_total,daily_cap); end if;
    end if;
  end if;
  return round(total+cycle_total,2);
end $$;
revoke all on function private.charge_amount(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function private.complete_parking_tariff_snapshot()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare rule public.tariff_rules;
begin
  if new.tariff_rule_id is null then return new; end if;
  select * into rule from public.tariff_rules where id=new.tariff_rule_id;
  if not found then raise exception 'TARIFF_RULE_NOT_FOUND' using errcode='P0002'; end if;
  new.tariff_snapshot:=coalesce(new.tariff_snapshot,'{}'::jsonb)||jsonb_build_object(
    'version_number',rule.version_number,
    'daily_after_minutes',rule.daily_after_minutes,
    'intermediate_cap_amount',rule.intermediate_cap_amount,
    'intermediate_after_minutes',rule.intermediate_after_minutes,
    'exit_grace_minutes',rule.exit_grace_minutes,
    'daily_cycle_minutes',rule.daily_cycle_minutes
  );
  return new;
end $$;
revoke all on function private.complete_parking_tariff_snapshot() from public,anon,authenticated;

update public.parking_sessions s
set tariff_snapshot=coalesce(s.tariff_snapshot,'{}'::jsonb)||jsonb_build_object(
  'intermediate_cap_amount',t.intermediate_cap_amount,
  'intermediate_after_minutes',t.intermediate_after_minutes,
  'exit_grace_minutes',t.exit_grace_minutes,
  'daily_cycle_minutes',t.daily_cycle_minutes
)
from public.tariff_rules t
where t.id=s.tariff_rule_id and not(coalesce(s.tariff_snapshot,'{}'::jsonb)?'daily_cycle_minutes');

create or replace function public.preview_tariff_charges_v2(
  target_unit uuid,first_hour numeric,additional numeric,fraction_minutes integer,
  tolerance_minutes integer,daily_amount numeric,daily_hours integer,
  intermediate_amount numeric,intermediate_hours numeric,exit_grace integer,
  daily_cycle_hours integer,sample_minutes integer[]
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,auth as $$
declare snapshot jsonb; result jsonb;
begin
  perform private.require_owner(target_unit);
  if first_hour<=0 or additional<=0 or fraction_minutes<=0 or tolerance_minutes<0
    or daily_amount<=0 or daily_hours<=0 or exit_grace<0 or exit_grace>120
    or daily_cycle_hours<=0 or daily_hours>daily_cycle_hours
    or ((intermediate_amount is null)<>(intermediate_hours is null))
    or (intermediate_amount is not null and (intermediate_amount<=0 or intermediate_hours<=0 or intermediate_hours>=daily_hours))
  then raise exception 'INVALID_TARIFF' using errcode='22023'; end if;

  snapshot:=jsonb_build_object(
    'first_hour_amount',first_hour,'additional_amount',additional,
    'additional_fraction_minutes',fraction_minutes,'grace_minutes',tolerance_minutes,
    'daily_cap_amount',daily_amount,'daily_after_minutes',daily_hours*60,
    'intermediate_cap_amount',intermediate_amount,
    'intermediate_after_minutes',case when intermediate_hours is null then null else round(intermediate_hours*60)::integer end,
    'exit_grace_minutes',exit_grace,'daily_cycle_minutes',daily_cycle_hours*60
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'minutes',sample,
    'total',private.charge_amount(snapshot,'2000-01-01 00:00:00+00'::timestamptz,
      '2000-01-01 00:00:00+00'::timestamptz+(sample*interval '1 minute'))
  ) order by sample),'[]'::jsonb) into result
  from unnest(sample_minutes) samples(sample);
  return result;
end $$;

create or replace function public.create_tariff_version_v2(
  target_unit uuid,target_vehicle_type public.vehicle_type,first_hour numeric,additional numeric,
  fraction_minutes integer,tolerance_minutes integer,daily_amount numeric,daily_hours integer,
  intermediate_amount numeric,intermediate_hours numeric,exit_grace integer,daily_cycle_hours integer
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; previous public.tariff_rules; next_version integer; new_id uuid; effective_at timestamptz:=clock_timestamp();
begin
  actor:=private.require_owner(target_unit);
  if first_hour<=0 or additional<=0 or fraction_minutes<=0 or tolerance_minutes<0
    or daily_amount<=0 or daily_hours<=0 or exit_grace<0 or exit_grace>120
    or daily_cycle_hours<=0 or daily_hours>daily_cycle_hours
    or ((intermediate_amount is null)<>(intermediate_hours is null))
    or (intermediate_amount is not null and (intermediate_amount<=0 or intermediate_hours<=0 or intermediate_hours>=daily_hours))
  then raise exception 'INVALID_TARIFF' using errcode='22023'; end if;

  perform 1 from public.parking_units where id=target_unit and is_active for update;
  if not found then raise exception 'UNIT_NOT_FOUND' using errcode='P0002'; end if;
  select * into previous from public.tariff_rules
    where unit_id=target_unit and vehicle_type=target_vehicle_type and is_active and valid_until is null for update;
  select coalesce(max(version_number),0)+1 into next_version from public.tariff_rules
    where unit_id=target_unit and vehicle_type=target_vehicle_type;
  if previous.id is not null then
    update public.tariff_rules set is_active=false,valid_until=effective_at,updated_at=effective_at where id=previous.id;
  end if;
  insert into public.tariff_rules(
    unit_id,name,vehicle_type,version_number,first_hour_amount,additional_amount,
    additional_fraction_minutes,grace_minutes,daily_cap_amount,daily_after_minutes,
    intermediate_cap_amount,intermediate_after_minutes,exit_grace_minutes,daily_cycle_minutes,
    valid_from,is_active,created_by
  ) values(
    target_unit,case target_vehicle_type when 'CAR' then 'Tarifa carro v' else 'Tarifa moto v' end||next_version,
    target_vehicle_type,next_version,round(first_hour,2),round(additional,2),fraction_minutes,tolerance_minutes,
    round(daily_amount,2),daily_hours*60,
    case when intermediate_amount is null then null else round(intermediate_amount,2) end,
    case when intermediate_hours is null then null else round(intermediate_hours*60)::integer end,
    exit_grace,daily_cycle_hours*60,effective_at,true,actor
  ) returning id into new_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'tariff.v2.created',jsonb_build_object(
    'vehicle_type',target_vehicle_type,'previous_tariff_id',previous.id,'new_tariff_id',new_id,
    'new_version',next_version,'intermediate_cap_amount',intermediate_amount,
    'intermediate_after_hours',intermediate_hours,'exit_grace_minutes',exit_grace,
    'daily_cycle_hours',daily_cycle_hours
  ));
  return new_id;
end $$;

revoke all on function public.preview_tariff_charges_v2(uuid,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer,integer[]) from public,anon;
revoke all on function public.create_tariff_version_v2(uuid,public.vehicle_type,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer) from public,anon;
grant execute on function public.preview_tariff_charges_v2(uuid,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer,integer[]) to authenticated;
grant execute on function public.create_tariff_version_v2(uuid,public.vehicle_type,numeric,numeric,integer,integer,numeric,integer,numeric,numeric,integer,integer) to authenticated;
