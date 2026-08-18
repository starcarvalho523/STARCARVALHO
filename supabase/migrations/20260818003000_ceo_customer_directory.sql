create or replace function public.get_ceo_customer_directory()
returns jsonb
language sql
security definer
set search_path = public, private, auth
as $$
with allowed_units as (
  select distinct uur.unit_id
  from public.user_unit_roles uur
  where uur.user_id = auth.uid()
    and coalesce(uur.is_active, true)
    and uur.role::text in ('owner','manager')
),
related_customers as (
  select distinct ps.customer_owner_id as customer_id
  from public.parking_sessions ps
  join allowed_units au on au.unit_id = ps.unit_id
  where ps.customer_owner_id is not null
  union
  select distinct ms.customer_id
  from public.monthly_subscriptions ms
  join allowed_units au on au.unit_id = ms.unit_id
),
customer_units as (
  select r.customer_id, pu.id as unit_id, pu.name as unit_name
  from related_customers r
  join public.parking_sessions ps on ps.customer_owner_id = r.customer_id
  join allowed_units au on au.unit_id = ps.unit_id
  join public.parking_units pu on pu.id = ps.unit_id
  union
  select r.customer_id, pu.id, pu.name
  from related_customers r
  join public.monthly_subscriptions ms on ms.customer_id = r.customer_id
  join allowed_units au on au.unit_id = ms.unit_id
  join public.parking_units pu on pu.id = ms.unit_id
),
rows as (
  select
    r.customer_id,
    coalesce(nullif(cp.full_name,''), nullif(p.full_name,''), 'Cliente') as full_name,
    au.email::text as email,
    coalesce(cp.is_active, p.is_active, true) as is_active,
    coalesce(cp.created_at, au.created_at) as created_at,
    (select count(distinct v.id)::int
       from public.vehicles v
      where v.customer_id = r.customer_id
        and (
          exists(select 1 from public.parking_sessions s join allowed_units x on x.unit_id=s.unit_id where s.vehicle_id=v.id)
          or exists(select 1 from public.monthly_subscriptions m join allowed_units x on x.unit_id=m.unit_id where m.customer_id=r.customer_id and m.vehicle_id=v.id)
        )) as vehicle_count,
    (select count(*)::int from public.parking_sessions s join allowed_units x on x.unit_id=s.unit_id where s.customer_owner_id=r.customer_id) as session_count,
    (select max(s.entered_at) from public.parking_sessions s join allowed_units x on x.unit_id=s.unit_id where s.customer_owner_id=r.customer_id) as last_visit_at,
    exists(select 1 from public.parking_sessions s join allowed_units x on x.unit_id=s.unit_id where s.customer_owner_id=r.customer_id and s.status::text in ('OPEN','PAYMENT_PENDING','PAID')) as has_active_session,
    (select m.status from public.monthly_subscriptions m join allowed_units x on x.unit_id=m.unit_id where m.customer_id=r.customer_id order by case m.status when 'ACTIVE' then 0 when 'PENDING_ACTIVATION' then 1 when 'SUSPENDED' then 2 else 3 end, m.created_at desc limit 1) as monthly_status,
    (select m.plan_name from public.monthly_subscriptions m join allowed_units x on x.unit_id=m.unit_id where m.customer_id=r.customer_id order by case m.status when 'ACTIVE' then 0 when 'PENDING_ACTIVATION' then 1 when 'SUSPENDED' then 2 else 3 end, m.created_at desc limit 1) as monthly_plan,
    (coalesce(cp.is_active,p.is_active,true) and exists(
       select 1 from public.vehicles v
       join public.parking_sessions s on s.vehicle_id=v.id
       join allowed_units x on x.unit_id=s.unit_id
       where v.customer_id=r.customer_id
    )) as eligible_for_monthly,
    coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',u.unit_name) order by u.unit_name) from customer_units u where u.customer_id=r.customer_id),'[]'::jsonb) as units
  from related_customers r
  left join public.customer_profiles cp on cp.user_id=r.customer_id
  left join public.profiles p on p.id=r.customer_id
  left join auth.users au on au.id=r.customer_id
)
select coalesce(jsonb_agg(jsonb_build_object(
  'customer_id',customer_id,'full_name',full_name,'email',email,'is_active',is_active,'created_at',created_at,
  'vehicle_count',vehicle_count,'session_count',session_count,'last_visit_at',last_visit_at,'has_active_session',has_active_session,
  'monthly_status',monthly_status,'monthly_plan',monthly_plan,'eligible_for_monthly',eligible_for_monthly,'units',units
) order by coalesce(last_visit_at,created_at) desc),'[]'::jsonb)
from rows;
$$;

revoke all on function public.get_ceo_customer_directory() from public;
grant execute on function public.get_ceo_customer_directory() to authenticated;

create or replace function public.get_ceo_customer_detail(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare result jsonb; allowed boolean;
begin
  select exists(
    select 1 from public.user_unit_roles uur
    where uur.user_id=auth.uid()
      and coalesce(uur.is_active,true)
      and uur.role::text in ('owner','manager')
      and (
        exists(select 1 from public.parking_sessions ps where ps.unit_id=uur.unit_id and ps.customer_owner_id=p_customer_id)
        or exists(select 1 from public.monthly_subscriptions ms where ms.unit_id=uur.unit_id and ms.customer_id=p_customer_id)
      )
  ) into allowed;
  if not allowed then return null; end if;

  with allowed_units as (
    select distinct unit_id from public.user_unit_roles
    where user_id=auth.uid() and coalesce(is_active,true) and role::text in ('owner','manager')
  ), scoped_sessions as (
    select ps.*, pu.name as unit_name
    from public.parking_sessions ps
    join allowed_units au on au.unit_id=ps.unit_id
    join public.parking_units pu on pu.id=ps.unit_id
    where ps.customer_owner_id=p_customer_id
    order by ps.entered_at desc limit 100
  ), scoped_subs as (
    select ms.*, pu.name as unit_name
    from public.monthly_subscriptions ms
    join allowed_units au on au.unit_id=ms.unit_id
    join public.parking_units pu on pu.id=ms.unit_id
    where ms.customer_id=p_customer_id
    order by ms.created_at desc
  ), scoped_vehicle_ids as (
    select distinct s.vehicle_id as id from scoped_sessions s where s.vehicle_id is not null
    union select distinct s.vehicle_id from scoped_subs s where s.vehicle_id is not null
  ), scoped_payments as (
    select p.* from public.payments p
    join allowed_units au on au.unit_id=p.unit_id
    where p.parking_session_id in(select id from scoped_sessions)
       or p.monthly_billing_period_id in(select bp.id from public.monthly_billing_periods bp join scoped_subs ss on ss.id=bp.subscription_id)
    order by p.created_at desc limit 100
  ), scoped_billing as (
    select bp.* from public.monthly_billing_periods bp
    join scoped_subs ss on ss.id=bp.subscription_id
    order by bp.period_start desc limit 36
  )
  select jsonb_build_object(
    'profile',jsonb_build_object('customer_id',p_customer_id,'full_name',coalesce(nullif(cp.full_name,''),nullif(pr.full_name,''),'Cliente'),'email',u.email,'is_active',coalesce(cp.is_active,pr.is_active,true),'created_at',coalesce(cp.created_at,u.created_at)),
    'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'plate',v.plate,'vehicle_type',v.vehicle_type::text,'notes',v.notes,'last_visit_at',(select max(s.entered_at) from scoped_sessions s where s.vehicle_id=v.id),'has_active_session',exists(select 1 from scoped_sessions s where s.vehicle_id=v.id and s.status::text in ('OPEN','PAYMENT_PENDING','PAID'))) order by v.plate) from public.vehicles v where v.customer_id=p_customer_id and v.id in(select id from scoped_vehicle_ids)),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'plate',s.plate_snapshot,'vehicle_type',s.vehicle_type::text,'status',s.status::text,'entered_at',s.entered_at,'exited_at',s.exited_at,'calculated_amount',s.calculated_amount,'final_amount',s.final_amount,'payment_status',s.payment_status::text,'entry_mode',s.entry_mode,'financial_obligation',s.financial_obligation) order by s.entered_at desc) from scoped_sessions s),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'unit_id',p.unit_id,'parking_session_id',p.parking_session_id,'amount',p.amount,'method',p.method::text,'status',p.status::text,'provider',p.provider,'paid_at',p.paid_at,'created_at',p.created_at,'payment_subject_type',p.payment_subject_type::text) order by p.created_at desc) from scoped_payments p),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'plan_id',s.plan_id,'plan_name',s.plan_name,'status',s.status,'starts_on',s.starts_on,'ends_on',s.ends_on,'due_day',s.due_day,'grace_days',s.grace_days,'contracted_price',s.contracted_price,'vehicle_id',s.vehicle_id,'cancel_at_period_end',s.cancel_at_period_end) order by s.created_at desc) from scoped_subs s),'[]'::jsonb),
    'billing_periods',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'subscription_id',b.subscription_id,'reference_year',b.reference_year,'reference_month',b.reference_month,'due_date',b.due_date,'grace_until',b.grace_until,'amount',b.amount,'status',b.status,'paid_at',b.paid_at) order by b.period_start desc) from scoped_billing b),'[]'::jsonb),
    'eligible_for_monthly',coalesce(cp.is_active,pr.is_active,true) and exists(select 1 from public.vehicles v join scoped_sessions s on s.vehicle_id=v.id where v.customer_id=p_customer_id)
  ) into result
  from auth.users u
  left join public.customer_profiles cp on cp.user_id=u.id
  left join public.profiles pr on pr.id=u.id
  where u.id=p_customer_id;
  return result;
end;
$$;

revoke all on function public.get_ceo_customer_detail(uuid) from public;
grant execute on function public.get_ceo_customer_detail(uuid) to authenticated;
