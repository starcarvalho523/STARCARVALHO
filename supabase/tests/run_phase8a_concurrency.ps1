param(
  [string]$PgBin = "C:\Program Files\PostgreSQL\17\bin",
  [int]$Port = 55438
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$psql = Join-Path $PgBin "psql.exe"
$migration = Join-Path $root "migrations\20260812223230_monthly_billing_automation.sql"
$schema = Join-Path $PSScriptRoot "phase8a_local_schema.sql"
$worker = Join-Path $PSScriptRoot "phase8a_concurrency_worker.sql"
$database = "phase8a_test"

& $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $database"
& $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $database"
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -f $schema
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -f $migration

$unit = (& $psql -qAt -h 127.0.0.1 -p $Port -U postgres -d $database -c "insert into public.parking_units(name) values ('F8A synthetic') returning id").Trim()
$subscription = (& $psql -qAt -h 127.0.0.1 -p $Port -U postgres -d $database -c "insert into public.monthly_subscriptions(unit_id,plan_id,status,starts_on,due_day,grace_days,contracted_price) values ('$unit',gen_random_uuid(),'ACTIVE','2026-01-01',31,5,5.00) returning id").Trim()

# Two real psql processes race for the same subscription/month.
$job1 = Start-Job -ScriptBlock { param($psql,$port,$db,$worker,$unit) & $psql -h 127.0.0.1 -p $port -U postgres -d $db -v ON_ERROR_STOP=1 -v unit_id=$unit -v target_day='2026-08-12' -f $worker } -ArgumentList $psql,$Port,$database,$worker,$unit
$job2 = Start-Job -ScriptBlock { param($psql,$port,$db,$worker,$unit) & $psql -h 127.0.0.1 -p $port -U postgres -d $db -v ON_ERROR_STOP=1 -v unit_id=$unit -v target_day='2026-08-12' -f $worker } -ArgumentList $psql,$Port,$database,$worker,$unit
Wait-Job $job1,$job2 | Out-Null; Receive-Job $job1,$job2 | Out-Null; Remove-Job $job1,$job2
$count = (& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -At -c "select count(*) from public.monthly_billing_periods where subscription_id='$subscription' and reference_year=2026 and reference_month=8").Trim()
if ($count -ne '1') { throw "CONCURRENCY_SAME_MONTH_FAILED: $count" }

# Manual vs batch use the same private core and must keep a single competence.
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -c "select public.run_monthly_billing_generation('$unit', true)" | Out-Null
$count = (& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -At -c "select count(*) from public.monthly_billing_periods where subscription_id='$subscription'").Trim()
if ($count -ne '1') { throw "MANUAL_BATCH_IDEMPOTENCY_FAILED: $count" }

# Reactivation is current-month only: a suspended historic month is never backfilled.
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -c "update public.monthly_subscriptions set status='SUSPENDED' where id='$subscription'; select private.generate_current_monthly_billing_periods_for_unit('$unit','2026-09-12',false,'CRON',null); update public.monthly_subscriptions set status='ACTIVE' where id='$subscription'; select private.generate_current_monthly_billing_periods_for_unit('$unit','2026-09-12',false,'CRON',null);" | Out-Null
$reactivation = (& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -At -c "select string_agg(reference_month::text,',' order by reference_month) from public.monthly_billing_periods where subscription_id='$subscription'").Trim()
if ($reactivation -ne '8,9') { throw "REACTIVATION_CURRENT_MONTH_ONLY_FAILED: $reactivation" }

# A suspended subscription locked concurrently must not receive the following month.
$suspendJob = Start-Job -ScriptBlock { param($psql,$port,$db,$subscription) & $psql -h 127.0.0.1 -p $port -U postgres -d $db -v ON_ERROR_STOP=1 -c "begin; select id from public.monthly_subscriptions where id='$subscription' for update; update public.monthly_subscriptions set status='SUSPENDED' where id='$subscription'; select pg_sleep(2); commit;" } -ArgumentList $psql,$Port,$database,$subscription
Start-Sleep -Milliseconds 1200
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -c "select private.generate_current_monthly_billing_periods_for_unit('$unit','2026-10-12',false,'CRON',null)" | Out-Null
Wait-Job $suspendJob | Out-Null; Receive-Job $suspendJob | Out-Null; Remove-Job $suspendJob
$october = (& $psql -qAt -h 127.0.0.1 -p $Port -U postgres -d $database -c "select count(*) from public.monthly_billing_periods where subscription_id='$subscription' and reference_month=10").Trim()
if ($october -ne '0') { throw "SUSPENSION_CONCURRENCY_FAILED: $october" }

# A concurrent contract-price change is serialized by the same row lock and snapshots one coherent amount.
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -c "update public.monthly_subscriptions set status='ACTIVE' where id='$subscription'" | Out-Null
$priceJob = Start-Job -ScriptBlock { param($psql,$port,$db,$subscription) & $psql -h 127.0.0.1 -p $port -U postgres -d $db -v ON_ERROR_STOP=1 -c "begin; select id from public.monthly_subscriptions where id='$subscription' for update; update public.monthly_subscriptions set contracted_price=9.00 where id='$subscription'; select pg_sleep(2); commit;" } -ArgumentList $psql,$Port,$database,$subscription
Start-Sleep -Milliseconds 1200
& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -v ON_ERROR_STOP=1 -c "select private.generate_current_monthly_billing_periods_for_unit('$unit','2026-10-12',false,'CRON',null)" | Out-Null
Wait-Job $priceJob | Out-Null; Receive-Job $priceJob | Out-Null; Remove-Job $priceJob
$octoberAmount = (& $psql -qAt -h 127.0.0.1 -p $Port -U postgres -d $database -c "select amount from public.monthly_billing_periods where subscription_id='$subscription' and reference_month=10").Trim()
if ($octoberAmount -ne '9.00') { throw "PLAN_CHANGE_CONCURRENCY_FAILED: $octoberAmount" }

# Civil-date boundary cases use the same clamped due-date function.
$dates = (& $psql -h 127.0.0.1 -p $Port -U postgres -d $database -At -c "select string_agg(private.monthly_due_date(y,m,31)::text,',' order by y,m) from (values (2025,2),(2024,2),(2026,4),(2026,12),(2027,1)) as x(y,m)").Trim()
if ($dates -ne '2024-02-29,2025-02-28,2026-04-30,2026-12-31,2027-01-31') { throw "DUE_DATE_BOUNDARY_FAILED: $dates" }

Write-Output "PHASE8A_CONCURRENCY_PASS"
