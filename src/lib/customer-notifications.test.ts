import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = "supabase/migrations/20260815135024_customer_tariff_notifications.sql";
const paymentInsertFix = "supabase/migrations/20260815135030_payment_confirmed_insert_notification.sql";
const capAlertFix = "supabase/migrations/20260815194500_fix_customer_forecast_cap_alerts.sql";
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
  const [sql, fix] = await Promise.all([read(migration), read(capAlertFix)]);
  for (const source of [sql, fix]) {
    assert.match(source, /private\.charge_amount\(s\.tariff_snapshot/);
    assert.doesNotMatch(source, /from public\.tariff_rules/);
    assert.match(source, /s\.status='OPEN' and s\.financial_obligation='REQUIRED'/);
    assert.doesNotMatch(source, /update public\.parking_sessions set (?:final_amount|theoretical_amount)/);
  }
});

test("grace and price milestones adapt without duplicate render events", () => {
  assert.deepEqual(markers({ remaining: 601 }), []);
  assert.deepEqual(markers({ remaining: 600 }), [10]);
  assert.deepEqual(markers({ remaining: 300 }), [5]);
  assert.deepEqual(markers({ remaining: 300, covered: true }), []);
  assert.deepEqual(markers({ remaining: 300, state: "EXITED" }), []);
});

test("daily cap warnings are based on the next official amount", async () => {
  const sql = await read(capAlertFix);
  assert.match(sql, /current_amount<cap_amount and next_amount>=cap_amount/);
  assert.match(sql, /DAILY_CAP_NEAR/);
  assert.match(sql, /DAILY_CAP_REACHED/);
  assert.match(sql, /replace\(to_char\(previous_amount/);
  assert.equal(nextIncrease(49, 50), true);
  assert.equal(nextIncrease(50, 50), false);
  assert.equal(nextIncrease(60, 50), false);
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

function markers({
  remaining,
  covered = false,
  state = "OPEN",
}: {
  remaining: number;
  covered?: boolean;
  state?: string;
}) {
  if (covered || state !== "OPEN" || remaining < 1 || remaining > 600) return [];
  return [remaining <= 300 ? 5 : 10];
}

function nextIncrease(current: number, cap: number | null) {
  return cap === null || current < cap;
}
