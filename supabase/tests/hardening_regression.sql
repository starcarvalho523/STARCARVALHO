-- Run against a linked development database. Every assertion is rolled back.
begin;

do $$
declare
  shift public.cash_shifts;
  divergent_close_blocked boolean := false;
begin
  if has_table_privilege('anon', 'public.payments', 'TRUNCATE') then
    raise exception 'anon still has TRUNCATE on payments';
  end if;
  if has_table_privilege('authenticated', 'public.payments', 'TRUNCATE') then
    raise exception 'authenticated still has TRUNCATE on payments';
  end if;
  if not has_table_privilege('authenticated', 'public.parking_sessions', 'SELECT') then
    raise exception 'authenticated lost SELECT on parking_sessions';
  end if;
  if has_table_privilege('authenticated', 'public.payments', 'UPDATE') then
    raise exception 'authenticated still has direct UPDATE on payments';
  end if;

  select * into shift
  from public.cash_shifts
  where status = 'OPEN'
  order by opened_at desc
  limit 1
  for update;

  if found then
    perform set_config('request.jwt.claim.sub', shift.operator_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      perform public.close_cash_shift(shift.id, shift.opening_amount + 1, null);
    exception when sqlstate '22023' then
      divergent_close_blocked := true;
    end;
    if not divergent_close_blocked then
      raise exception 'divergent shift close without notes was not blocked';
    end if;
  end if;
end $$;

rollback;

