import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDaysIso, nextUngeneratedThirtyDayDueDate } from "./recurring-30-day-schedule.ts";

test("ciclo comercial avança exatamente 30 dias",()=>{
  assert.equal(addCalendarDaysIso("2026-08-07",30),"2026-09-06");
  assert.equal(addCalendarDaysIso("2026-09-06",30),"2026-10-06");
  assert.equal(addCalendarDaysIso("2026-10-06",30),"2026-11-05");
});

test("não reutiliza vencimento que o Asaas já gerou",()=>{
  assert.equal(
    nextUngeneratedThirtyDayDueDate("2026-10-06",["2026-09-06","2026-10-06"],"2026-09-06"),
    "2026-11-05",
  );
});

test("webhook atrasado avança a cadência até uma data futura e não gerada",()=>{
  assert.equal(
    nextUngeneratedThirtyDayDueDate("2026-09-06",["2026-08-07","2026-09-06"],"2026-10-01"),
    "2026-10-06",
  );
});

test("cobranças futuras já geradas são ultrapassadas em passos de 30 dias",()=>{
  assert.equal(
    nextUngeneratedThirtyDayDueDate("2026-10-06",["2026-10-06","2026-11-05"],"2026-09-06"),
    "2026-12-05",
  );
});
