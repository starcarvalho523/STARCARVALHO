do $$
begin
  if to_regclass('public.terminal_assignments') is not null then
    create index if not exists terminal_assignments_assigned_by_idx
      on public.terminal_assignments(assigned_by);
  end if;
end
$$;
