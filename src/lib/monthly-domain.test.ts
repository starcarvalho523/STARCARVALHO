import assert from"node:assert/strict";import test from"node:test";import{isMonthlyOverdue,validateMonthlyPlan}from"./monthly-domain.ts";
test("aceita plano mensal vÃ¡lido",()=>assert.equal(validateMonthlyPlan({name:"Central",price:150,dueDay:10,graceDays:3,maxVehicles:2}),true));
test("rejeita plano invÃ¡lido",()=>assert.equal(validateMonthlyPlan({name:"A",price:0,dueDay:32,graceDays:-1,maxVehicles:0}),false));
test("inadimplÃªncia Ã© derivada apenas de PENDING fora da tolerÃ¢ncia",()=>{assert.equal(isMonthlyOverdue("PENDING","2026-08-10","2026-08-11"),true);assert.equal(isMonthlyOverdue("PAID","2026-08-10","2026-08-11"),false);assert.equal(isMonthlyOverdue("PENDING","2026-08-11","2026-08-11"),false);});
