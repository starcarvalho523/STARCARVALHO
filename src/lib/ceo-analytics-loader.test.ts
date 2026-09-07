import assert from "node:assert/strict";
import test from "node:test";
import { loadCeoAnalytics, type CeoAnalyticsDependencies, type CeoAnalyticsView } from "./ceo-analytics-loader.ts";

const now = Date.UTC(2026, 8, 7, 15);
const session = { id: "s1", unit_id: "u1", vehicle_id: "v1", plate_snapshot: "ABC1D23", vehicle_type: "CAR", status: "CLOSED", entered_at: "2026-09-06T10:00:00Z", exited_at: "2026-09-06T12:00:00Z", final_amount: 20, payment_status: "PAID", entry_mode: "CASUAL", financial_obligation: "REQUIRED", monthly_subscription_id: null, theoretical_amount: null };
const fixtures: Record<string, unknown[]> = {
  parking_units: [{ id: "u1", name: "Unidade 1", capacity: 20, timezone: "America/Bahia", is_active: true }],
  history: [session, { ...session, id: "s2", vehicle_id: "v2", financial_obligation: "WAIVED_BY_MONTHLY_COVERAGE", monthly_subscription_id: "m1", entry_mode: "MONTHLY", theoretical_amount: 15 }],
  active: [{ ...session, id: "s3", status: "OPEN", entered_at: "2026-09-07T14:00:00Z", exited_at: null }],
  payments: [
    { id: "p1", unit_id: "u1", amount: 20, status: "PAID", method: "PIX", provider: "ASAAS", provider_environment: "production", paid_at: "2026-09-06T12:00:00Z", created_at: "2026-09-06T12:00:00Z", received_by: "op1", payment_subject_type: "PARKING_SESSION" },
    { id: "p2", unit_id: "u1", amount: 100, status: "PAID", method: "CREDIT_CARD", paid_at: "2026-09-06T12:00:00Z", created_at: "2026-09-06T12:00:00Z", received_by: null, payment_subject_type: "MONTHLY_BILLING_PERIOD" },
    { id: "test", unit_id: "u1", amount: 999, status: "PAID", method: "PIX", provider: "ASAAS", provider_environment: "sandbox", paid_at: "2026-09-06T12:00:00Z", created_at: "2026-09-06T12:00:00Z", received_by: null },
  ],
  previous: [{ amount: 40, status: "PAID", paid_at: "2026-08-01T12:00:00Z" }],
  cash_shifts: [{ id: "c1", unit_id: "u1", operator_id: "op1", status: "CLOSED", opened_at: "2026-09-06T10:00:00Z", closed_at: "2026-09-06T20:00:00Z", difference_amount: 5 }],
  user_unit_roles: [{ user_id: "op1", unit_id: "u1", role: "operator" }],
  tariff_rules: [{ id: "t1", unit_id: "u1", is_active: true }],
  monthly_subscriptions: [{ id: "m1", unit_id: "u1", status: "ACTIVE", contracted_price: 100, starts_on: "2026-08-01", cancel_at_period_end: false }],
  monthly_billing_periods: [{ id: "b1", unit_id: "u1", subscription_id: "m1", reference_year: 2026, reference_month: 9, due_date: "2026-09-01", grace_until: "2026-09-04", status: "PENDING" }],
  monthly_billing_generation_runs: [],
  profiles: [{ id: "op1", full_name: "Operador", is_active: true }],
};
function harness(options: { denied?: boolean; noUnits?: boolean; fail?: string; gate?: { name: string; wait: Promise<void> } } = {}) {
  const calls: Array<{ name: string; filters: unknown[][] }> = [];
  const from = (table: string) => {
    let selection = "";
    const filters: unknown[][] = [];
    const q = {
      select: (value: string) => { selection = value; return q; },
      in: (...args: unknown[]) => { filters.push(["in", ...args]); return q; },
      eq: (...args: unknown[]) => { filters.push(["eq", ...args]); return q; },
      not: (...args: unknown[]) => { filters.push(["not", ...args]); return q; },
      or: (...args: unknown[]) => { filters.push(["or", ...args]); return q; },
      gte: (...args: unknown[]) => { filters.push(["gte", ...args]); return q; },
      lt: (...args: unknown[]) => { filters.push(["lt", ...args]); return q; },
      order: () => q,
      limit: (...args: unknown[]) => { filters.push(["limit", ...args]); return q; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (async () => {
        const name = table === "parking_sessions" ? (filters.some(f => f[1] === "status") ? "active" : "history") :
          table === "payments" && selection.startsWith("amount,") ? "previous" : table;
        calls.push({ name, filters });
        if (options.gate?.name === name) await options.gate.wait;
        if (options.fail === name) throw new Error("unavailable: " + name);
        return { data: options.noUnits && table === "parking_units" ? [] : fixtures[name] ?? [], error: null };
      })().then(resolve, reject),
    };
    return q;
  };
  const deps = {
    requireArea: async () => { if (options.denied) throw new Error("DENIED"); return { assignments: options.noUnits ? [] : [{ unit_id: "u1" }] }; },
    createClient: async () => ({ from }),
  } as unknown as CeoAnalyticsDependencies;
  return { deps, calls };
}
const filters = { period: "30", unitId: "all" } as const;
const commonFinancial = ["revenue", "casualRevenue", "monthlyRevenue", "ticket", "payments", "cashDifference"];
const operational = ["active", "capacity", "occupancy", "entries", "exits", "averageMinutes"];

for (const [view, fields, metrics, expectedQueries] of [
  ["dashboard", ["active", "mrr", "alerts", "unitSummaries", "methods"], [...commonFinancial, ...operational], 8],
  ["units", ["unitSummaries"], [], 8],
  ["unit", ["unitSummaries", "roles", "tariffs", "shifts", "mrr", "alerts", "methods"], commonFinancial, 10],
  ["finance", ["payments", "paid", "shifts", "names", "methods"], commonFinancial, 4],
  ["reports", ["sessions", "active", "payments", "shifts", "coverage", "mrr", "methods"], [...commonFinancial, ...operational], 6],
  ["alerts", ["alerts", "active"], [], 6],
] as Array<[CeoAnalyticsView, string[], string[], number]>) {
  test(view + " preserves displayed data with fewer database requests", async t => {
    t.mock.timers.enable({ apis: ["Date"], now });
    const baseline = harness();
    const full = await loadCeoAnalytics(baseline.deps, filters);
    const h = harness();
    const scoped = await loadCeoAnalytics(h.deps, filters, view);
    for (const field of ["units", ...fields]) {
      assert.deepEqual(scoped[field as keyof typeof scoped], full[field as keyof typeof full], field);
    }
    for (const field of metrics) {
      assert.deepEqual(scoped.metrics[field as keyof typeof scoped.metrics], full.metrics[field as keyof typeof full.metrics], field);
    }
    assert.equal(baseline.calls.length, 12);
    assert.equal(h.calls.length, expectedQueries);
  });
}

test("denied access never starts a database request", async () => {
  const h = harness({ denied: true });
  await assert.rejects(loadCeoAnalytics(h.deps, filters), /DENIED/);
  assert.equal(h.calls.length, 0);
});

test("no assigned units produces an empty result without operational reads", async () => {
  const h = harness({ noUnits: true });
  const data = await loadCeoAnalytics(h.deps, filters);
  assert.deepEqual(data.selectedUnits, []);
  assert.deepEqual(h.calls.map(c => c.name), ["parking_units"]);
});

test("an unassigned unit never expands the authenticated scope", async () => {
  const h = harness();
  await loadCeoAnalytics(h.deps, { ...filters, unitId: "foreign-unit" });
  for (const call of h.calls.filter(c => c.name !== "profiles")) {
    assert.deepEqual(call.filters[0], ["in", call.name === "parking_units" ? "id" : "unit_id", ["u1"]]);
  }
});

for (const view of ["dashboard", "units", "unit", "finance", "reports", "alerts"] as const) {
  test(view + " never waits for an unused previous-period query", async () => {
    await loadCeoAnalytics(harness({ fail: "previous" }).deps, filters, view);
  });
}

test("finance remains independent of parking history and monthly alerts", async () => {
  for (const fail of ["history", "active", "monthly_subscriptions", "monthly_billing_periods", "tariff_rules", "user_unit_roles"]) {
    const data = await loadCeoAnalytics(harness({ fail }).deps, filters, "finance");
    assert.equal(data.payments.length, 3);
  }
});

test("alerts remain independent of payment history", async () => {
  const h = harness({ fail: "payments" });
  assert.ok((await loadCeoAnalytics(h.deps, filters, "alerts")).alerts.length);
});

test("parallel reads start while another required query is pending", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ gate: { name: "payments", wait } });
  const result = loadCeoAnalytics(h.deps, filters, "finance");
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(h.calls.some(c => c.name === "cash_shifts"));
  } finally { release(); }
  await result;
});

test("period boundaries, ordering limits and active statuses remain on queries", async t => {
  t.mock.timers.enable({ apis: ["Date"], now });
  const h = harness();
  await loadCeoAnalytics(h.deps, filters);
  const history = h.calls.find(c => c.name === "history")!;
  assert.deepEqual(history.filters.at(-1), ["limit", 1000]);
  assert.match(String(history.filters.find(f => f[0] === "or")?.[1]), /entered_at.gte.*exited_at.gte/);
  assert.deepEqual(h.calls.find(c => c.name === "active")?.filters[1], ["in", "status", ["OPEN", "PAYMENT_PENDING", "PAID", "MANUAL_REVIEW"]]);
  assert.ok(h.calls.find(c => c.name === "previous")?.filters.some(f => f[0] === "lt"));
});
