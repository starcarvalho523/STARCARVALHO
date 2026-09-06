import assert from "node:assert/strict";
import test from "node:test";
import { commercialSummary } from "./ceo-commercial-analytics.ts";

test("commercial summary separates capacity, recurring revenue and demand loss", () => {
  const result = commercialSummary({
    units: [{ id: "u1", capacity: 20 }],
    zones: [
      { unit_id: "u1", capacity: 8, is_active: true, zone_type: "ROTATION" },
      { unit_id: "u1", capacity: 6, is_active: true, zone_type: "MONTHLY" },
    ],
    sessions: [
      { unit_id: "u1", status: "OPEN", entered_at: "2026-09-06T10:00:00Z", exited_at: null, entry_mode: "CASUAL" },
      { unit_id: "u1", status: "PAID", entered_at: "2026-09-06T10:00:00Z", exited_at: null, entry_mode: "MONTHLY" },
    ],
    payments: [{ unit_id: "u1", status: "PAID", amount: 600, paid_at: "2026-09-06T12:00:00Z" }],
    subscriptions: [{ unit_id: "u1", status: "ACTIVE", contracted_price: 250 }],
    demand: Array.from({ length: 6 }, (_, index) => ({ unit_id: "u1", reason: index < 5 ? "FULL" : "OTHER", occurred_at: "2026-09-06T12:00:00Z" })),
    businessContracts: [{ unit_id: "u1", status: "ACTIVE", price: 1000 }],
    days: 30,
  });

  assert.equal(result.totalCapacity, 20);
  assert.equal(result.allocatedZoneCapacity, 14);
  assert.equal(result.unallocatedCapacity, 6);
  assert.equal(result.openSessions, 2);
  assert.equal(result.occupancy, 10);
  assert.equal(result.revpas, 1);
  assert.equal(result.monthlyMrr, 250);
  assert.equal(result.businessMrr, 1000);
  assert.equal(result.recurringMrr, 1250);
  assert.equal(result.fullDemand, 5);
  assert.equal(result.monthlyShare, 50);
  assert.equal(result.expansionStatus, "WATCH");
});

test("commercial summary recommends expansion at sustained capacity pressure", () => {
  const result = commercialSummary({
    units: [{ id: "u1", capacity: 10 }],
    zones: [],
    sessions: Array.from({ length: 9 }, () => ({ unit_id: "u1", status: "OPEN", entered_at: "2026-09-06T10:00:00Z", exited_at: null, entry_mode: "CASUAL" })),
    payments: [], subscriptions: [], demand: [], businessContracts: [], days: 30,
  });
  assert.equal(result.occupancy, 90);
  assert.equal(result.expansionStatus, "STUDY_EXPANSION");
});
