alter table public.tariff_rules
  add column version_number integer not null default 1 check (version_number > 0),
  add column daily_after_minutes integer check (daily_after_minutes is null or daily_after_minutes > 0);

create unique index tariff_rules_unit_vehicle_version_idx
  on public.tariff_rules(unit_id, vehicle_type, version_number);

create or replace function private.require_owner(target_unit uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.has_unit_role(target_unit, array['owner']::public.app_role[]) then
    raise exception 'OWNER_FORBIDDEN' using errcode = '42501';
  end if;
  return actor;
end;
$$;

revoke all on function private.require_owner(uuid) from public, anon;
grant execute on function private.require_owner(uuid) to authenticated;

create or replace function private.charge_amount(snapshot jsonb, entered timestamptz, reference_time timestamptz)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  mins integer := greatest(0, ceil(extract(epoch from (reference_time - entered)) / 60)::integer);
  total numeric;
  fraction integer;
  daily_cap numeric;
  daily_after integer;
begin
  if mins <= (snapshot->>'grace_minutes')::integer then
    return 0;
  end if;

  total := (snapshot->>'first_hour_amount')::numeric;
  if mins > 60 then
    fraction := (snapshot->>'additional_fraction_minutes')::integer;
    total := total + ceil((mins - 60)::numeric / fraction) * (snapshot->>'additional_amount')::numeric;
  end if;

  daily_cap := nullif(snapshot->>'daily_cap_amount', '')::numeric;
  daily_after := nullif(snapshot->>'daily_after_minutes', '')::integer;
  if daily_cap is not null then
    if daily_after is not null and mins >= daily_after then
      total := daily_cap;
    else
      total := least(total, daily_cap);
    end if;
  end if;

  return round(total, 2);
end;
$$;

revoke all on function private.charge_amount(jsonb, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function private.register_parking_entry(target_unit uuid, raw_plate text, target_vehicle_type public.vehicle_type)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  normalized text := upper(regexp_replace(coalesce(raw_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v public.vehicles;
  tariff public.tariff_rules;
  new_id uuid;
begin
  actor := private.require_operator(target_unit);
  if normalized !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'INVALID_PLATE' using errcode = '22023';
  end if;

  select * into tariff
  from public.tariff_rules
  where unit_id = target_unit
    and vehicle_type = target_vehicle_type
    and is_active
    and valid_from <= clock_timestamp()
    and (valid_until is null or valid_until > clock_timestamp())
  order by valid_from desc
  limit 1;

  if not found then
    raise exception 'NO_ACTIVE_TARIFF' using errcode = 'P0001';
  end if;

  insert into public.vehicles(plate, normalized_plate, vehicle_type)
  values(normalized, normalized, target_vehicle_type)
  on conflict(normalized_plate) do update
    set vehicle_type = excluded.vehicle_type, updated_at = clock_timestamp()
  returning * into v;

  begin
    insert into public.parking_sessions(unit_id, vehicle_id, plate_snapshot, vehicle_type, entry_operator_id, tariff_rule_id, tariff_snapshot)
    values(target_unit, v.id, normalized, target_vehicle_type, actor, tariff.id,
      jsonb_build_object(
        'name', tariff.name,
        'version_number', tariff.version_number,
        'first_hour_amount', tariff.first_hour_amount,
        'additional_amount', tariff.additional_amount,
        'additional_fraction_minutes', tariff.additional_fraction_minutes,
        'grace_minutes', tariff.grace_minutes,
        'daily_cap_amount', tariff.daily_cap_amount,
        'daily_after_minutes', tariff.daily_after_minutes
      ))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'ACTIVE_SESSION_EXISTS' using errcode = '23505';
  end;

  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
  values(actor, target_unit, 'parking.entry.created', jsonb_build_object('session_id', new_id, 'plate', normalized));
  return new_id;
end;
$$;

create or replace function private.preview_tariff_charges(
  target_unit uuid,
  first_hour numeric,
  additional numeric,
  fraction_minutes integer,
  tolerance_minutes integer,
  daily_amount numeric,
  daily_hours integer,
  sample_minutes integer[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  snapshot jsonb;
  result jsonb;
begin
  perform private.require_owner(target_unit);
  if first_hour <= 0 or additional <= 0 or fraction_minutes <= 0 or tolerance_minutes < 0 or daily_amount <= 0 or daily_hours <= 0 then
    raise exception 'INVALID_TARIFF' using errcode = '22023';
  end if;
  snapshot := jsonb_build_object(
    'first_hour_amount', first_hour,
    'additional_amount', additional,
    'additional_fraction_minutes', fraction_minutes,
    'grace_minutes', tolerance_minutes,
    'daily_cap_amount', daily_amount,
    'daily_after_minutes', daily_hours * 60
  );
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'minutes', sample,
        'total', private.charge_amount(
          snapshot,
          '2000-01-01 00:00:00+00'::timestamptz,
          '2000-01-01 00:00:00+00'::timestamptz + (sample * interval '1 minute')
        )
      ) order by sample
    ),
    '[]'::jsonb
  ) into result
  from unnest(sample_minutes) as samples(sample);
  return result;
end;
$$;

create or replace function private.create_tariff_version(
  target_unit uuid,
  target_vehicle_type public.vehicle_type,
  first_hour numeric,
  additional numeric,
  fraction_minutes integer,
  tolerance_minutes integer,
  daily_amount numeric,
  daily_hours integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid;
  previous public.tariff_rules;
  next_version integer;
  new_id uuid;
  effective_at timestamptz := clock_timestamp();
begin
  actor := private.require_owner(target_unit);
  if first_hour <= 0 or additional <= 0 or fraction_minutes <= 0 or tolerance_minutes < 0 or daily_amount <= 0 or daily_hours <= 0 then
    raise exception 'INVALID_TARIFF' using errcode = '22023';
  end if;

  perform 1 from public.parking_units where id = target_unit and is_active for update;
  if not found then raise exception 'UNIT_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into previous
  from public.tariff_rules
  where unit_id = target_unit and vehicle_type = target_vehicle_type and is_active and valid_until is null
  for update;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.tariff_rules
  where unit_id = target_unit and vehicle_type = target_vehicle_type;

  if previous.id is not null then
    update public.tariff_rules
    set is_active = false, valid_until = effective_at, updated_at = effective_at
    where id = previous.id;
  end if;

  insert into public.tariff_rules(unit_id, name, vehicle_type, version_number, first_hour_amount, additional_amount, additional_fraction_minutes, grace_minutes, daily_cap_amount, daily_after_minutes, valid_from, is_active, created_by)
  values(target_unit, case target_vehicle_type when 'CAR' then 'Tarifa carro v' else 'Tarifa moto v' end || next_version, target_vehicle_type, next_version, round(first_hour, 2), round(additional, 2), fraction_minutes, tolerance_minutes, round(daily_amount, 2), daily_hours * 60, effective_at, true, actor)
  returning id into new_id;

  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
  values(actor, target_unit, 'tariff.created', jsonb_build_object(
    'vehicle_type', target_vehicle_type,
    'previous_tariff_id', previous.id,
    'previous_version', previous.version_number,
    'new_tariff_id', new_id,
    'new_version', next_version,
    'previous_values', case when previous.id is null then null else jsonb_build_object('first_hour_amount', previous.first_hour_amount, 'additional_amount', previous.additional_amount, 'additional_fraction_minutes', previous.additional_fraction_minutes, 'grace_minutes', previous.grace_minutes, 'daily_cap_amount', previous.daily_cap_amount, 'daily_after_minutes', previous.daily_after_minutes) end,
    'new_values', jsonb_build_object('first_hour_amount', round(first_hour, 2), 'additional_amount', round(additional, 2), 'additional_fraction_minutes', fraction_minutes, 'grace_minutes', tolerance_minutes, 'daily_cap_amount', round(daily_amount, 2), 'daily_after_minutes', daily_hours * 60)
  ));
  return new_id;
end;
$$;

revoke all on function private.preview_tariff_charges(uuid, numeric, numeric, integer, integer, numeric, integer, integer[]), private.create_tariff_version(uuid, public.vehicle_type, numeric, numeric, integer, integer, numeric, integer) from public, anon;
grant execute on function private.preview_tariff_charges(uuid, numeric, numeric, integer, integer, numeric, integer, integer[]), private.create_tariff_version(uuid, public.vehicle_type, numeric, numeric, integer, integer, numeric, integer) to authenticated;

create or replace function public.preview_tariff_charges(target_unit uuid, first_hour numeric, additional numeric, fraction_minutes integer, tolerance_minutes integer, daily_amount numeric, daily_hours integer, sample_minutes integer[])
returns jsonb language sql stable security invoker set search_path = pg_catalog, private
as $$ select private.preview_tariff_charges(target_unit, first_hour, additional, fraction_minutes, tolerance_minutes, daily_amount, daily_hours, sample_minutes) $$;

create or replace function public.create_tariff_version(target_unit uuid, target_vehicle_type public.vehicle_type, first_hour numeric, additional numeric, fraction_minutes integer, tolerance_minutes integer, daily_amount numeric, daily_hours integer)
returns uuid language sql security invoker set search_path = pg_catalog, private
as $$ select private.create_tariff_version(target_unit, target_vehicle_type, first_hour, additional, fraction_minutes, tolerance_minutes, daily_amount, daily_hours) $$;

revoke all on function public.preview_tariff_charges(uuid, numeric, numeric, integer, integer, numeric, integer, integer[]), public.create_tariff_version(uuid, public.vehicle_type, numeric, numeric, integer, integer, numeric, integer) from public, anon;
grant execute on function public.preview_tariff_charges(uuid, numeric, numeric, integer, integer, numeric, integer, integer[]), public.create_tariff_version(uuid, public.vehicle_type, numeric, numeric, integer, integer, numeric, integer) to authenticated;

with target_unit as (
  select id from public.parking_units where slug = 'star-cavalos-central'
), owner_user as (
  select uur.user_id from public.user_unit_roles uur join target_unit u on u.id = uur.unit_id
  join public.profiles p on p.id = uur.user_id and p.is_active
  where uur.role = 'owner' limit 1
), inserted as (
  insert into public.tariff_rules(unit_id, name, vehicle_type, version_number, first_hour_amount, additional_amount, additional_fraction_minutes, grace_minutes, daily_cap_amount, daily_after_minutes, valid_from, is_active, created_by)
  select u.id, case v.vehicle_type when 'CAR'::public.vehicle_type then 'Tarifa carro v1' else 'Tarifa moto v1' end, v.vehicle_type, 1, 5.00, 3.00, 30, 10, 50.00, 600, clock_timestamp(), true, o.user_id
  from target_unit u cross join owner_user o cross join (values ('CAR'::public.vehicle_type), ('MOTORCYCLE'::public.vehicle_type)) v(vehicle_type)
  where not exists (select 1 from public.tariff_rules t where t.unit_id = u.id and t.vehicle_type = v.vehicle_type and t.is_active and t.valid_until is null)
  returning id, unit_id, vehicle_type, version_number, created_by
)
insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
select created_by, unit_id, 'tariff.created', jsonb_build_object('source', 'migration', 'vehicle_type', vehicle_type, 'new_tariff_id', id, 'new_version', version_number, 'new_values', jsonb_build_object('first_hour_amount', 5.00, 'additional_amount', 3.00, 'additional_fraction_minutes', 30, 'grace_minutes', 10, 'daily_cap_amount', 50.00, 'daily_after_minutes', 600))
from inserted;
