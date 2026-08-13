import assert from "node:assert/strict";
import test from "node:test";
import { monthlySubscriptionVehicleDisplay } from "./monthly-subscription-vehicle-display.ts";

const vehicle = (id: string, normalized_plate: string) => ({ id, normalized_plate });
const link = (id: string, vehicle_id: string, valid_until: string | null = null) => ({ id, vehicle_id, valid_until });

test("shows the linked vehicle plate", () => {
  assert.equal(monthlySubscriptionVehicleDisplay([link("link-1", "vehicle-1")], new Map([["vehicle-1", vehicle("vehicle-1", "ABC1D23")]])), "ABC1D23");
});

test("shows no vehicle only when there is no active link", () => {
  assert.equal(monthlySubscriptionVehicleDisplay([], new Map()), "Sem veículo");
  assert.equal(monthlySubscriptionVehicleDisplay([link("link-1", "vehicle-1", "2026-08-01")], new Map()), "Sem veículo");
});

test("does not mask a dangling active link as a normal absence", () => {
  assert.equal(monthlySubscriptionVehicleDisplay([link("link-1", "missing")], new Map()), "Vínculo de veículo inconsistente");
});

test("keeps multiple active links deterministic in their query order", () => {
  const vehicles = new Map([
    ["vehicle-1", vehicle("vehicle-1", "ABC1D23")],
    ["vehicle-2", vehicle("vehicle-2", "DEF4G56")],
  ]);
  assert.equal(monthlySubscriptionVehicleDisplay([link("link-1", "vehicle-1"), link("link-2", "vehicle-2")], vehicles), "ABC1D23, DEF4G56");
});
