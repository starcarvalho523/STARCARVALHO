import test from "node:test";
import assert from "node:assert/strict";
import { monthlyReminder } from "./monthly-automation.ts";

const today = new Date("2026-08-12T12:00:00");
test("deriva lembretes sem persistir estado", () => {
  assert.equal(monthlyReminder("2026-08-15", "2026-08-20", today), "Vence em 3 dias");
  assert.equal(monthlyReminder("2026-08-11", "2026-08-20", today), "Vencida — em carência até 20/08/2026");
  assert.equal(monthlyReminder("2026-08-01", "2026-08-10", today), "Inadimplente");
});
