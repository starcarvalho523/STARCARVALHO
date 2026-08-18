create or replace function public.get_audit_events(
  p_unit_ids uuid[] default null,
  p_since timestamptz default null,
  p_limit integer default 500
)
returns table (
  id bigint,
  unit_id uuid,
  actor_user_id uuid,
  actor_name text,
  action text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    a.id,
    a.unit_id,
    a.actor_user_id,
    case
      when a.actor_user_id is null then 'Sistema'::text
      else coalesce(nullif(btrim(p.full_name), ''), 'Usuário identificado'::text)
    end as actor_name,
    a.action,
    a.created_at
  from public.audit_logs a
  left join public.profiles p on p.id = a.actor_user_id
  where a.unit_id is not null
    and private.has_unit_role(
      a.unit_id,
      array['owner'::public.app_role, 'auditor'::public.app_role]
    )
    and (p_unit_ids is null or a.unit_id = any(p_unit_ids))
    and (p_since is null or a.created_at >= p_since)
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
$$;

revoke all on function public.get_audit_events(uuid[], timestamptz, integer) from public;
grant execute on function public.get_audit_events(uuid[], timestamptz, integer) to authenticated;
