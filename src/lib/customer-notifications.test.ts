import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = "supabase/migrations/20260815135024_customer_tariff_notifications.sql";
const paymentInsertFix = "supabase/migrations/20260815135030_payment_confirmed_insert_notification.sql";
const capAlertFix = "supabase/migrations/20260815194500_fix_customer_forecast_cap_alerts.sql";
const preferences = "supabase/migrations/20260815195800_customer_forecast_preferences_monthly_alerts.sql";
const read = (path: string) => readFile(path, "utf8");

test("notifications are isolated, read-only and deduplicated", async () => {
  const sql = await read(migration);
  assert.match(sql, /unique\(customer_id,dedupe_key\)/);
  assert.match(sql, /customer_id=\(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on public\.customer_notifications from public,anon,authenticated/);
  assert.match(sql, /grant select on public\.customer_notifications to authenticated/);
  assert.match(sql, /where id=notification_id and customer_id=actor/);
  assert.match(sql, /on conflict\(customer_id,dedupe_key\) do nothing/);
});

test("tariff forecast uses frozen snapshot and official server calculator", async () => {
  const [sql, fix, preferenceSql] = await Promise.all([read(migration), read(capAlertFix), read(preferences)]);
  for (const source of [sql, fix, preferenceSql]) {
    assert.match(source, /private\.charge_amount\(s\.tariff_snapshot/);
    assert.doesNotMatch(source, /from public\.tariff_rules/);
    assert.match(source, /s\.status='OPEN' and s\.financial_obligation='REQUIRED'/);
    assert.doesNotMatch(source, /update public\.parking_sessions set (?:final_amount|theoretical_amount)/);
  }
});

test("tariff alert preference is auth-bound and limited to 5, 10 or 15 minutes", async () => {
  const sql=await read(preferences);
  assert.match(sql,/tariff_alert_minutes in \(5,10,15\)/);
  assert.match(sql,/actor uuid:=auth\.uid\(\)/);
  assert.match(sql,/target_minutes not in \(5,10,15\)/);
  assert.match(sql,/where user_id=actor and is_active=true/);
  assert.match(sql,/alert_seconds:=alert_minutes\*60/);
  assert.deepEqual(preferredMarkers(900,15),[15]);
  assert.deepEqual(preferredMarkers(601,10),[]);
  assert.deepEqual(preferredMarkers(300,5),[5]);
});

test("forecast exposes the tariff timeline inputs without querying live tariff rules", async()=>{
  const [sql,ui]=await Promise.all([read(preferences),read("src/components/parking-forecast-panel.tsx")]);
  assert.match(sql,/'graceMinutes',grace_mins/);
  assert.match(sql,/'firstHourAmount',first_hour_amount/);
  assert.match(sql,/'additionalAmount',additional_amount/);
  assert.match(sql,/'additionalFractionMinutes',fraction_mins/);
  assert.match(sql,/'dailyAfterMinutes',cap_after/);
  assert.match(ui,/Como a tarifa evolui/);
  assert.match(ui,/Entrada/);
  assert.match(ui,/Tolerância/);
  assert.match(ui,/1ª hora/);
  assert.match(ui,/Próxima fração/);
  assert.match(ui,/Diária/);
});

test("daily cap warnings are based on the next official amount", async () => {
  const sql = await read(preferences);
  assert.match(sql, /current_amount<cap_amount and next_amount>=cap_amount/);
  assert.match(sql, /DAILY_CAP_NEAR/);
  assert.match(sql, /DAILY_CAP_REACHED/);
  assert.match(sql, /replace\(to_char\(previous_amount/);
  assert.equal(nextIncrease(49, 50), true);
  assert.equal(nextIncrease(50, 50), false);
  assert.equal(nextIncrease(60, 50), false);
});

test("monthly alerts distinguish five days, tomorrow, overdue and active vehicle coverage",async()=>{
  const sql=await read(preferences);
  assert.match(sql,/days_until=5/);
  assert.match(sql,/Mensalidade vence em 5 dias/);
  assert.match(sql,/days_until=1/);
  assert.match(sql,/Mensalidade vence amanhã/);
  assert.match(sql,/days_until<0/);
  assert.match(sql,/MONTHLY_PAYMENT_OVERDUE/);
  assert.match(sql,/MONTHLY_VEHICLE_COVERAGE_ACTIVE/);
  assert.match(sql,/A cobertura mensal está ativa para o veículo/);
  assert.match(sql,/on public\.monthly_subscription_vehicles/);
});

test("manual paid inserts also emit payment confirmation", async () => {
  const sql = await read(paymentInsertFix);
  assert.match(sql, /TG_OP='INSERT'/i);
  assert.match(sql, /new\.status='PAID'/i);
  assert.match(sql, /after insert or update of status on public\.payments/i);
  assert.match(sql, /PAYMENT_CONFIRMED/);
});

test("polling is visibility-aware and stops outside relevant sessions", async () => {
  const ui = await read("src/components/parking-forecast-panel.tsx");
  assert.match(ui, /document\.visibilityState === "visible"/);
  assert.match(ui, /forecast\?\.shouldPoll/);
  assert.match(ui, /window\.clearTimeout/);
  assert.match(ui, /120000/);
  assert.match(ui, /30000/);
});

test("pending activation becomes active only on paid and then uses existing recurrence", async () => {
  const [notifications, hardening, automation] = await Promise.all([
    read(migration),
    read("supabase/migrations/20260815132350_pre_golive_customer_hardening.sql"),
    read("supabase/migrations/20260812235933_monthly_billing_automation.sql"),
  ]);
  assert.match(hardening, /values\(actor,p\.unit_id,p\.id,p\.name,'PENDING_ACTIVATION'/);
  assert.match(notifications, /new\.status='PAID'[\s\S]*status='ACTIVE'[\s\S]*status='PENDING_ACTIVATION'/);
  assert.match(automation, /s\.status\s*=\s*'ACTIVE'/);
  assert.match(automation, /on conflict \(subscription_id, reference_year, reference_month\) do nothing/);
});

function preferredMarkers(remaining:number,preference:number){
  if(remaining<1||remaining>preference*60)return[];
  return[preference];
}

function nextIncrease(current: number, cap: number | null) {
  return cap === null || current < cap;
}
