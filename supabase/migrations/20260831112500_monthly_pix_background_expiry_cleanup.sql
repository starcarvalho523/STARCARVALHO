create extension if not exists pg_net;

create table if not exists private.monthly_pix_cleanup_requests (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  transaction_id uuid not null references private.payment_provider_transactions(id) on delete cascade,
  request_id bigint,
  status text not null default 'IDLE' check (status in ('IDLE','QUEUED','SUCCESS','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_http_status integer,
  last_error text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists monthly_pix_cleanup_requests_status_idx
  on private.monthly_pix_cleanup_requests(status,last_attempt_at);

create or replace function private.monthly_pix_cleanup_environment_ready()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private, vault
as $$
  select exists (
    select 1
      from private.payment_provider_runtime_config c
     where c.provider = 'ASAAS'
       and c.environment = 'SANDBOX'
       and c.live_enabled = false
  )
  and exists (
    select 1
      from vault.secrets s
     where s.name = 'ASAAS_SANDBOX_API_KEY'
  );
$$;

create or replace function private.enqueue_expired_monthly_pix_cleanup_requests()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net
as $$
declare
  row_item record;
  api_key text;
  req_id bigint;
  enqueued integer := 0;
begin
  if not private.monthly_pix_cleanup_environment_ready() then
    return jsonb_build_object('skipped', true, 'reason', 'SANDBOX_ENVIRONMENT_NOT_READY');
  end if;

  select ds.decrypted_secret
    into api_key
    from vault.decrypted_secrets ds
   where ds.name = 'ASAAS_SANDBOX_API_KEY'
   limit 1;

  if api_key is null or length(api_key) < 10 then
    return jsonb_build_object('skipped', true, 'reason', 'ASAAS_SANDBOX_API_KEY_MISSING');
  end if;

  for row_item in
    select p.id as payment_id,
           t.id as transaction_id,
           t.provider_payment_id
      from public.payments p
      join lateral (
        select tx.*
          from private.payment_provider_transactions tx
         where tx.payment_id = p.id
         order by tx.created_at desc
         limit 1
      ) t on true
      left join private.monthly_pix_cleanup_requests q on q.payment_id = p.id
     where p.status = 'PENDING'
       and p.method = 'PIX'
       and p.provider = 'ASAAS'
       and p.provider_environment = 'SANDBOX'
       and p.monthly_billing_period_id is not null
       and t.provider_payment_id is not null
       and t.expires_at is not null
       and t.expires_at <= clock_timestamp()
       and t.state in ('PENDING','CREATING','RECONCILING')
       and coalesce(q.attempt_count,0) < 5
       and (
         q.payment_id is null
         or q.status in ('IDLE','FAILED')
         and coalesce(q.last_attempt_at, '-infinity'::timestamptz) <= clock_timestamp() - interval '30 seconds'
       )
     order by t.expires_at
     limit 25
  loop
    req_id := net.http_delete(
      url := 'https://api-sandbox.asaas.com/v3/payments/' || pg_catalog.encode(convert_to(row_item.provider_payment_id,'UTF8'),'escape'),
      headers := jsonb_build_object(
        'accept','application/json',
        'access_token',api_key,
        'user-agent','StarCarvalhos-QA/monthly-pix-cleanup'
      ),
      timeout_milliseconds := 10000
    );

    insert into private.monthly_pix_cleanup_requests(
      payment_id, transaction_id, request_id, status, attempt_count, last_http_status,
      last_error, last_attempt_at, completed_at, updated_at
    ) values (
      row_item.payment_id, row_item.transaction_id, req_id, 'QUEUED', 1, null,
      null, clock_timestamp(), null, clock_timestamp()
    )
    on conflict (payment_id) do update
       set transaction_id = excluded.transaction_id,
           request_id = excluded.request_id,
           status = 'QUEUED',
           attempt_count = private.monthly_pix_cleanup_requests.attempt_count + 1,
           last_http_status = null,
           last_error = null,
           last_attempt_at = clock_timestamp(),
           completed_at = null,
           updated_at = clock_timestamp();
    enqueued := enqueued + 1;
  end loop;

  return jsonb_build_object('enqueued', enqueued);
end;
$$;

create or replace function private.finalize_monthly_pix_cleanup_requests()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, net
as $$
declare
  row_item record;
  response_row record;
  finalized integer := 0;
  failed integer := 0;
begin
  for row_item in
    select q.payment_id,q.transaction_id,q.request_id
      from private.monthly_pix_cleanup_requests q
     where q.status='QUEUED'
       and q.request_id is not null
       and q.last_attempt_at <= clock_timestamp() - interval '5 seconds'
     order by q.last_attempt_at
     limit 50
     for update skip locked
  loop
    select r.status_code,r.timed_out,r.error_msg
      into response_row
      from net._http_response r
     where r.id=row_item.request_id;

    if not found then
      continue;
    end if;

    if coalesce(response_row.timed_out,false) or response_row.error_msg is not null then
      update private.monthly_pix_cleanup_requests
         set status='FAILED',
             last_error=left(coalesce(response_row.error_msg,'HTTP_REQUEST_FAILED'),240),
             updated_at=clock_timestamp()
       where payment_id=row_item.payment_id;
      failed := failed + 1;
      continue;
    end if;

    if response_row.status_code in (200,204,404) then
      update public.payments
         set status='CANCELLED'
       where id=row_item.payment_id
         and status='PENDING'
         and method='PIX'
         and monthly_billing_period_id is not null;

      if found then
        update private.payment_provider_transactions
           set state='CANCELLED',
               provider_status='CANCELLED',
               failure_code='PIX_EXPIRED_5_MINUTES_BACKGROUND',
               failure_description=null,
               expires_at=least(coalesce(expires_at,clock_timestamp()),clock_timestamp()),
               updated_at=clock_timestamp()
         where id=row_item.transaction_id
           and payment_id=row_item.payment_id;
      end if;

      update private.monthly_pix_cleanup_requests
         set status='SUCCESS',
             last_http_status=response_row.status_code,
             last_error=null,
             completed_at=clock_timestamp(),
             updated_at=clock_timestamp()
       where payment_id=row_item.payment_id;
      finalized := finalized + 1;
    else
      update private.monthly_pix_cleanup_requests
         set status='FAILED',
             last_http_status=response_row.status_code,
             last_error='ASAAS_DELETE_HTTP_'||coalesce(response_row.status_code::text,'UNKNOWN'),
             updated_at=clock_timestamp()
       where payment_id=row_item.payment_id;
      failed := failed + 1;
    end if;
  end loop;

  return jsonb_build_object('finalized',finalized,'failed',failed);
end;
$$;

create or replace function private.run_monthly_pix_background_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  finalized jsonb;
  enqueued jsonb;
begin
  if not private.monthly_pix_cleanup_environment_ready() then
    return jsonb_build_object('skipped', true, 'reason', 'SANDBOX_ENVIRONMENT_NOT_READY');
  end if;
  finalized := private.finalize_monthly_pix_cleanup_requests();
  enqueued := private.enqueue_expired_monthly_pix_cleanup_requests();
  return jsonb_build_object('finalize', finalized, 'enqueue', enqueued);
end;
$$;

revoke all on table private.monthly_pix_cleanup_requests from public, anon, authenticated;
revoke all on function private.monthly_pix_cleanup_environment_ready() from public, anon, authenticated;
revoke all on function private.enqueue_expired_monthly_pix_cleanup_requests() from public, anon, authenticated;
revoke all on function private.finalize_monthly_pix_cleanup_requests() from public, anon, authenticated;
revoke all on function private.run_monthly_pix_background_cleanup() from public, anon, authenticated;

do $$
declare
  existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname='monthly-pix-expiry-cleanup-qa' loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  if private.monthly_pix_cleanup_environment_ready() then
    perform cron.schedule(
      'monthly-pix-expiry-cleanup-qa',
      '* * * * *',
      'select private.run_monthly_pix_background_cleanup();'
    );
  end if;
end;
$$;
