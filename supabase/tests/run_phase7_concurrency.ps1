$ErrorActionPreference="Stop"
$psql="C:\Program Files\PostgreSQL\17\bin\psql.exe"
if (-not $env:PGPASSWORD) { throw "PGPASSWORD não configurado" }
$db="starcarvalho_phase7_local"
$actor="61000000-0000-0000-0000-000000000003"
function Invoke-Pair([string]$first,[string]$second){
  $block={param($exe,$database,$sql)& $exe -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d $database -Atc $sql 2>&1}
  $a=Start-Job -ScriptBlock $block -ArgumentList $psql,$db,$first
  $b=Start-Job -ScriptBlock $block -ArgumentList $psql,$db,$second
  Wait-Job $a,$b|Out-Null;$outA=Receive-Job $a;$outB=Receive-Job $b;Remove-Job $a,$b
  return @{A=($outA-join " ");B=($outB-join " ")}
}
function Auth([string]$sql){return "begin;select set_config('request.jwt.claim.sub','$actor',true);set local role authenticated;$sql;commit;"}
function Scalar([string]$sql){return (& $psql -X -q -h 127.0.0.1 -p 5432 -U postgres -d $db -Atc $sql)}
function Assert-Scalar([string]$sql,[string]$expected,[string]$label){$actual=Scalar $sql;if($actual-ne$expected){throw "$label expected=$expected actual=$actual"}}
function Exec([string]$sql){& $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d $db -c $sql;if($LASTEXITCODE-ne0){throw "SQL failed"}}

$cash2=Auth "select public.record_monthly_cash_payment('68000000-0000-0000-0000-000000000002',gen_random_uuid())"
Invoke-Pair $cash2 $cash2|Out-Null
Assert-Scalar "select count(*) from public.payments where monthly_billing_period_id='68000000-0000-0000-0000-000000000002'" "1" "CASH x CASH"

$cash3=Auth "select public.record_monthly_cash_payment('68000000-0000-0000-0000-000000000003',gen_random_uuid())"
$pix3=Auth "select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000003',gen_random_uuid())"
Invoke-Pair $cash3 $pix3|Out-Null
Assert-Scalar "select count(*) from public.payments where monthly_billing_period_id='68000000-0000-0000-0000-000000000003'" "1" "CASH x PIX"

$pix4=Auth "select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000004',gen_random_uuid())"
$credit4=Auth "select public.reserve_monthly_credit_checkout('68000000-0000-0000-0000-000000000004',gen_random_uuid())"
Invoke-Pair $pix4 $credit4|Out-Null
Assert-Scalar "select count(*) from public.payments where monthly_billing_period_id='68000000-0000-0000-0000-000000000004'" "1" "PIX x Credit"

$pix5=Auth "select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000005',gen_random_uuid())"
Invoke-Pair $pix5 $pix5|Out-Null
Assert-Scalar "select count(*) from public.payments where monthly_billing_period_id='68000000-0000-0000-0000-000000000005'" "1" "PIX x PIX"
Assert-Scalar "select count(*) from private.payment_provider_transactions t join public.payments p on p.id=t.payment_id where p.monthly_billing_period_id='68000000-0000-0000-0000-000000000005'" "1" "one provider transaction"

# Create a CASUAL snapshot while the period is overdue, then race the real
# provider confirmation against CASH. Paying the period must not rewrite it.
Exec "update public.monthly_billing_periods set due_date=current_date-5,grace_until=current_date-1 where id='68000000-0000-0000-0000-000000000001'"
Exec (Auth "select public.register_parking_entry_with_coverage('62000000-0000-0000-0000-000000000001','AUT1A11','CAR','CASUAL',null);select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000001')")
$provider=Scalar "select t.id||'|'||t.external_reference from private.payment_provider_transactions t join public.payments p on p.id=t.payment_id where p.monthly_billing_period_id='68000000-0000-0000-0000-000000000001'"
$pieces=$provider.Split('|');$transactionId=$pieces[0];$externalReference=$pieces[1]
Exec "select public.mark_provider_external_created('$transactionId','pay_phase7_webhook','cus_phase7','PENDING',100,'$externalReference',null)"
$webhook="select public.process_asaas_webhook('evt_phase7_received','PAYMENT_RECEIVED','pay_phase7_webhook','RECEIVED',100,'{}'::jsonb)"
$cash1=Auth "select public.record_monthly_cash_payment('68000000-0000-0000-0000-000000000001',gen_random_uuid())"
Invoke-Pair $webhook $cash1|Out-Null
Assert-Scalar "select count(*)||':'||count(*)filter(where status='PAID') from public.payments where monthly_billing_period_id='68000000-0000-0000-0000-000000000001'" "1:1" "webhook x CASH"
Invoke-Pair $webhook $webhook|Out-Null
Assert-Scalar "select count(*) from private.payment_provider_events where provider_event_id='evt_phase7_received'" "1" "duplicate webhook"
Assert-Scalar "select entry_mode||':'||financial_obligation||':'||monthly_coverage_reason from public.parking_sessions where plate_snapshot='AUT1A11'" "CASUAL:REQUIRED:OVERDUE_OUTSIDE_GRACE" "CASUAL snapshot"
$paidPix=Auth "select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000001',gen_random_uuid())"
$paidCredit=Auth "select public.reserve_monthly_credit_checkout('68000000-0000-0000-0000-000000000001',gen_random_uuid())"
Invoke-Pair $paidPix $paidCredit|Out-Null
Assert-Scalar "select count(*) from public.payments where monthly_billing_period_id='68000000-0000-0000-0000-000000000001'" "1" "attempt after PAID"

# WAIVED and CANCELED never produce a payment even when called directly.
$waived=Auth "select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000007',gen_random_uuid())"
$canceled=Auth "select public.reserve_monthly_pix_payment('68000000-0000-0000-0000-000000000008',gen_random_uuid())"
Invoke-Pair $waived $canceled|Out-Null
Assert-Scalar "select count(*) from public.payments where monthly_billing_period_id in('68000000-0000-0000-0000-000000000007','68000000-0000-0000-0000-000000000008')" "0" "non-payable periods"

# Customer isolation is enforced by the real RLS policies in the disposable DB.
Assert-Scalar "set request.jwt.claim.sub='61000000-0000-0000-0000-000000000004';set role authenticated;select count(*) from public.monthly_billing_periods;reset role" "8" "customer A periods"
Assert-Scalar "set request.jwt.claim.sub='61000000-0000-0000-0000-000000000005';set role authenticated;select count(*) from public.monthly_billing_periods;reset role" "0" "customer B isolation"

Write-Output "PHASE7_CONCURRENCY_OK"
