import test from "node:test";import assert from "node:assert/strict";
import{coveragePresentation}from"./operator-monthly-coverage.ts";
import{formatPaymentMethod,formatSessionFinancialStatus,sessionParkingStatus}from"./operator-format.ts";
test("paid coverage maps to monthly",()=>assert.deepEqual(coveragePresentation("ACTIVE_PAID"),{label:"Mensalista ativo",tone:"green",covered:true,mode:"MONTHLY"}));
test("grace coverage stays explicit",()=>assert.equal(coveragePresentation("ACTIVE_WITHIN_GRACE").mode,"MONTHLY_GRACE"));
test("overdue never becomes covered in the browser",()=>assert.equal(coveragePresentation("OVERDUE_OUTSIDE_GRACE").covered,false));
test("suspended, canceled and missing period require server decision",()=>{for(const reason of ["SUBSCRIPTION_SUSPENDED","SUBSCRIPTION_CANCELED","NO_BILLING_PERIOD"] as const)assert.equal(coveragePresentation(reason).covered,false);});
test("monthly modes override the legacy pending payment presentation",()=>{
  assert.equal(formatSessionFinancialStatus("MONTHLY","WAIVED_BY_MONTHLY_COVERAGE"),"Mensalidade — coberto");
  assert.equal(formatSessionFinancialStatus("MONTHLY_GRACE","WAIVED_BY_MONTHLY_COVERAGE"),"Mensalidade — em carência");
  assert.equal(formatSessionFinancialStatus("MONTHLY_EXCEPTION","WAIVED_BY_MONTHLY_COVERAGE"),"Mensalidade — exceção autorizada");
  assert.equal(sessionParkingStatus("PAID","MONTHLY","WAIVED_BY_MONTHLY_COVERAGE").label,"Mensalidade — coberto — aguardando saída");
});
test("casual and real payment methods keep their existing presentation",()=>{
  assert.equal(formatSessionFinancialStatus("CASUAL","REQUIRED"),null);
  assert.equal(sessionParkingStatus("PAYMENT_PENDING","CASUAL","REQUIRED").label,"Aguardando pagamento");
  assert.equal(formatPaymentMethod("PIX"),"PIX");
  assert.equal(formatPaymentMethod("CASH"),"Dinheiro");
  assert.equal(formatPaymentMethod("CREDIT_CARD"),"Cartão de crédito");
  assert.equal(formatPaymentMethod("CARD",true),"Cartão — legado manual");
});
