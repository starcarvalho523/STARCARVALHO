create index audit_logs_actor_idx on public.audit_logs (actor_user_id);
create index audit_logs_target_idx on public.audit_logs (target_user_id);
create index employee_invitations_auth_user_idx on public.employee_invitations (auth_user_id);
create index employee_invitations_invited_by_idx on public.employee_invitations (invited_by);

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
