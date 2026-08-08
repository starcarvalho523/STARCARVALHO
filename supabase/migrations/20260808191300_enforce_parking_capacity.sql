create or replace function private.enforce_parking_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_capacity integer;
  occupied integer;
begin
  select capacity
    into unit_capacity
    from public.parking_units
   where id = new.unit_id
   for update;

  if unit_capacity is null then
    raise exception 'UNIT_NOT_FOUND';
  end if;

  select count(*)::integer
    into occupied
    from public.parking_sessions
   where unit_id = new.unit_id
     and status in ('OPEN', 'PAYMENT_PENDING', 'PAID', 'MANUAL_REVIEW');

  if occupied >= unit_capacity then
    raise exception 'PARKING_FULL';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_parking_capacity() from public;

drop trigger if exists enforce_parking_capacity_before_insert on public.parking_sessions;
create trigger enforce_parking_capacity_before_insert
before insert on public.parking_sessions
for each row execute function private.enforce_parking_capacity();
