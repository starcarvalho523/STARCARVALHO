-- Operação Comercial 2.0 — trava final de capacidade e zonas B2B
-- Garante que a evolução de cobertura mensal/B2B não contorne o limite físico da unidade.

create or replace function private.assign_parking_zone()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare
  selected_zone uuid;
  unit_capacity integer;
  occupied_unit integer;
  active_zone_capacity integer;
  has_zones boolean:=false;
  is_monthly boolean:=false;
  is_business boolean:=false;
  guaranteed boolean:=false;
begin
  -- Serializa decisões de capacidade da mesma unidade para evitar duas entradas
  -- simultâneas ocuparem a última vaga ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtextextended('parking-capacity:'||new.unit_id::text,0));

  select u.capacity into unit_capacity
  from public.parking_units u
  where u.id=new.unit_id and u.is_active;
  if unit_capacity is null then raise exception 'UNIT_NOT_FOUND' using errcode='P0002'; end if;

  select count(*) into occupied_unit
  from public.parking_sessions ps
  where ps.unit_id=new.unit_id
    and ps.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW');
  if occupied_unit>=unit_capacity then
    raise exception 'PARKING_FULL' using errcode='P0001';
  end if;

  if new.zone_id is not null then return new; end if;

  select exists(select 1 from public.parking_zones z where z.unit_id=new.unit_id and z.is_active),
         coalesce(sum(z.capacity) filter(where z.is_active),0)::integer
    into has_zones,active_zone_capacity
  from public.parking_zones z
  where z.unit_id=new.unit_id;
  if not has_zones then return new; end if;

  is_monthly:=new.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE';
  is_business:=new.financial_obligation='WAIVED_BY_BUSINESS_CONTRACT';

  if is_monthly and new.monthly_subscription_id is not null then
    select coalesce(p.guaranteed_space,false) into guaranteed
    from public.monthly_subscriptions s
    join public.monthly_plans p on p.id=s.plan_id
    where s.id=new.monthly_subscription_id;
  elsif is_business and new.business_contract_id is not null then
    select coalesce(c.guaranteed_spaces,0)>0 into guaranteed
    from public.business_parking_contracts c
    where c.id=new.business_contract_id;
  end if;

  select z.id into selected_zone
  from public.parking_zones z
  left join lateral(
    select count(*)::integer occupied
    from public.parking_sessions ps
    where ps.zone_id=z.id
      and ps.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW')
  ) o on true
  where z.unit_id=new.unit_id
    and z.is_active
    and coalesce(o.occupied,0)<z.capacity
    and(
      (is_monthly and guaranteed and z.zone_type in ('RESERVED','MONTHLY','FLEX'))
      or(is_monthly and not guaranteed and z.zone_type in ('MONTHLY','FLEX'))
      or(is_business and guaranteed and z.zone_type in ('RESERVED','FLEX','ROTATION'))
      or(is_business and not guaranteed and z.zone_type in ('ROTATION','FLEX'))
      or(not is_monthly and not is_business and z.zone_type in ('ROTATION','FLEX'))
    )
  order by
    case
      when is_monthly and guaranteed and z.zone_type='RESERVED' then 0
      when is_business and guaranteed and z.zone_type='RESERVED' then 0
      when is_monthly and z.zone_type='MONTHLY' then 1
      when (is_business or (not is_monthly and not is_business)) and z.zone_type='ROTATION' then 1
      when z.zone_type='FLEX' then 2
      else 3
    end,
    z.priority asc,
    coalesce(o.occupied,0)::numeric/z.capacity asc,
    z.code asc
  limit 1;

  -- Se toda a capacidade física está distribuída em zonas e nenhuma zona
  -- compatível possui espaço, a entrada deve ser recusada. Quando ainda há
  -- capacidade não alocada, preservamos compatibilidade permitindo zone_id nulo.
  if selected_zone is null and active_zone_capacity>=unit_capacity then
    raise exception 'PARKING_FULL' using errcode='P0001';
  end if;

  new.zone_id:=selected_zone;
  return new;
end $$;
revoke all on function private.assign_parking_zone() from public,anon,authenticated;

drop trigger if exists assign_parking_zone_before_insert on public.parking_sessions;
create trigger assign_parking_zone_before_insert
before insert on public.parking_sessions
for each row execute function private.assign_parking_zone();
