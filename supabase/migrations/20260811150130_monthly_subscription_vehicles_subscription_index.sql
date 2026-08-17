do $$
begin
  if to_regclass('public.monthly_subscription_vehicles') is not null then
    create index if not exists monthly_subscription_vehicles_subscription_idx
      on public.monthly_subscription_vehicles(subscription_id);
  end if;
end
$$;
