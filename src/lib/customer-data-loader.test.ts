import assert from "node:assert/strict";
import test from "node:test";
import { loadCustomerData, type CustomerDataDependencies, type CustomerDataScope } from "./customer-data-loader.ts";

const session = { id: "session-1", unit_id: "unit-1", vehicle_id: "vehicle-1", status: "OPEN", payments: [] };
const fixtures: Record<string, unknown> = {
  customer_profiles: { full_name: "Cliente", billing_document: null },
  vehicles: [{ id: "vehicle-1", plate: "ABC1D23" }],
  parking_sessions: [session],
  monthly_billing_periods: [{ id: "period-1", payments: [] }],
  customer_notifications: [{ id: "notice-1", read_at: null }],
  customer_parking_charge: { total: 12 },
};
function harness(options: { fail?: string; noVehicles?: boolean; noActive?: boolean; denied?: boolean; gate?: { name: string; wait: Promise<void> } } = {}) {
  const calls: Array<{ name: string; args: unknown[]; filters: Array<unknown[]> }> = [];
  const events: string[] = [];
  const builder = (name: string, args: unknown[] = []) => {
    const call = { name, args, filters: [] as Array<unknown[]> };
    const query = {
      select: () => query,
      eq: (...values: unknown[]) => { call.filters.push(["eq", ...values]); return query; },
      in: (...values: unknown[]) => { call.filters.push(["in", ...values]); return query; },
      gte: (...values: unknown[]) => { call.filters.push(["gte", ...values]); return query; },
      order: () => query,
      limit: (...values: unknown[]) => { call.filters.push(["limit", ...values]); return query; },
      single: () => query,
      maybeSingle: () => query,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (async () => {
        calls.push(call); events.push(name + ":start");
        if (options.gate?.name === name) await options.gate.wait;
        const data = options.noVehicles && name === "vehicles" ? [] :
          options.noActive && name === "parking_sessions" ? [{ ...session, status: "CLOSED" }] : fixtures[name] ?? null;
        events.push(name + ":end");
        return { data, error: options.fail === name ? { message: "unavailable" } : null };
      })().then(resolve, reject),
    };
    return query;
  };
  const deps = {
    requireArea: async () => {
      events.push("authorize");
      if (options.denied) throw new Error("DENIED");
      return { user: { id: "customer-1", email: "qa@example.invalid" } };
    },
    createClient: async () => ({ from: builder, rpc: builder }),
    getPaymentAvailability: async (...args: unknown[]) => { calls.push({ name: "availability", args, filters: [] }); return []; },
    isEfiCardProductionCanaryForActor: async (...args: unknown[]) => { calls.push({ name: "cardCanary", args, filters: [] }); return true; },
    isEfiPixProductionCanaryForActor: async (...args: unknown[]) => { calls.push({ name: "pixCanary", args, filters: [] }); return false; },
    resolveCustomerPaymentOptions: (capabilities: unknown, flags: unknown) => ({ capabilities, flags }),
  } as unknown as CustomerDataDependencies;
  return { deps, calls, events, names: () => calls.map(call => call.name) };
}

test("authorization failure never starts customer reads", async () => {
  const h = harness({ denied: true });
  await assert.rejects(loadCustomerData(h.deps), /DENIED/);
  assert.deepEqual(h.calls, []);
});

for (const scope of ["account", "notifications"] as const) {
  test(scope + " stays usable when unrelated parking and billing data is unavailable", async () => {
    const h = harness({ fail: "vehicles" });
    const data = await loadCustomerData(h.deps, scope);
    assert.deepEqual(h.names().sort(), ["customer_notifications", "customer_profiles", "refresh_customer_notifications"]);
    assert.equal(data.profile.full_name, "Cliente");
    assert.equal(data.unreadNotifications, 1);
    assert.deepEqual(data.sessions, []);
    assert.ok(h.events.indexOf("refresh_customer_notifications:end") < h.events.indexOf("customer_notifications:start"));
  });
}

test("independent branches start while the profile query is still pending", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ gate: { name: "customer_profiles", wait } });
  const pending = loadCustomerData(h.deps);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(h.names().includes("parking_sessions"));
    assert.ok(h.names().includes("monthly_billing_periods"));
    assert.ok(h.names().includes("customer_notifications"));
    assert.ok(!h.events.includes("customer_profiles:end"));
  } finally { release(); }
  await pending;
});

test("notification reads wait for refresh even when other data has finished", async () => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ gate: { name: "refresh_customer_notifications", wait } });
  const pending = loadCustomerData(h.deps, "home");
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(h.names().includes("parking_sessions"));
    assert.ok(!h.names().includes("customer_notifications"));
  } finally { release(); }
  assert.equal((await pending).unreadNotifications, 1);
});

for (const [scope, fields] of [
  ["home", ["profile", "vehicles", "sessions", "active", "activeCharge", "activePaymentOptions"]],
  ["stays", ["vehicles", "sessions", "active", "activePaymentOptions"]],
  ["vehicles", ["vehicles", "sessions"]],
  ["payments", ["vehicles", "sessions", "monthlyPeriods"]],
  ["monthly", ["vehicles", "monthlyPeriods"]],
] as Array<[CustomerDataScope, string[]]>) {
  test(scope + " preserves its rendered data compared with the complete bundle", async () => {
    const all = await loadCustomerData(harness().deps);
    const h = harness();
    const scoped = await loadCustomerData(h.deps, scope);
    for (const field of [...fields, "notifications", "unreadNotifications", "email"]) {
      assert.deepEqual(scoped[field as keyof typeof scoped], all[field as keyof typeof all], field);
    }
    if (scope !== "home") assert.ok(!h.names().includes("customer_parking_charge"));
    if (["vehicles", "payments", "monthly"].includes(scope)) assert.ok(!h.names().includes("availability"));
    if (["home", "stays", "vehicles"].includes(scope)) assert.ok(!h.names().includes("monthly_billing_periods"));
    if (scope === "monthly") assert.ok(!h.names().includes("parking_sessions"));
  });
}

test("ownership filters and history limits remain attached to customer reads", async () => {
  const h = harness();
  await loadCustomerData(h.deps);
  assert.deepEqual(h.calls.find(c => c.name === "vehicles")?.filters[0], ["eq", "customer_id", "customer-1"]);
  assert.deepEqual(h.calls.find(c => c.name === "customer_profiles")?.filters[0], ["eq", "user_id", "customer-1"]);
  const filters = h.calls.find(c => c.name === "parking_sessions")!.filters;
  assert.deepEqual(filters[0], ["in", "vehicle_id", ["vehicle-1"]]);
  assert.deepEqual(filters.at(-1), ["limit", 250]);
  assert.equal(filters[1][0], "gte");
  assert.deepEqual(h.calls.find(c => c.name === "cardCanary")?.args, ["session-1", "customer-1"]);
  assert.deepEqual(h.calls.find(c => c.name === "pixCanary")?.args, ["session-1", "customer-1"]);
});

test("no vehicles avoids session and payment capability reads", async () => {
  const h = harness({ noVehicles: true });
  const data = await loadCustomerData(h.deps, "home");
  assert.deepEqual(data.sessions, []);
  assert.equal(data.active, null);
  assert.ok(!h.names().includes("parking_sessions"));
  assert.ok(!h.names().includes("availability"));
});

test("closed sessions never load active payment capabilities", async () => {
  const h = harness({ noActive: true });
  assert.equal((await loadCustomerData(h.deps, "home")).active, null);
  assert.ok(!h.names().includes("cardCanary"));
  assert.ok(!h.names().includes("customer_parking_charge"));
});

for (const [name, message] of [
  ["customer_profiles", "CUSTOMER_PROFILE_UNAVAILABLE"],
  ["vehicles", "CUSTOMER_VEHICLES_UNAVAILABLE"],
  ["parking_sessions", "CUSTOMER_SESSIONS_UNAVAILABLE"],
  ["monthly_billing_periods", "CUSTOMER_MONTHLY_PERIODS_UNAVAILABLE"],
  ["customer_notifications", "CUSTOMER_NOTIFICATIONS_UNAVAILABLE"],
]) {
  test("required query failure is not silently rendered as empty: " + name, async () => {
    await assert.rejects(loadCustomerData(harness({ fail: name }).deps), new RegExp(message));
  });
}

test("optional charge failure retains the existing null fallback", async () => {
  const data = await loadCustomerData(harness({ fail: "customer_parking_charge" }).deps, "home");
  assert.equal(data.activeCharge, null);
  assert.equal(data.active?.id, "session-1");
});
