import assert from "node:assert/strict";
import test from "node:test";
import { checkoutResolutionDisposition, selectCheckoutCandidates } from "./checkout-webhook-reconciliation.ts";

const monthly={transactionId:"monthly",checkoutId:"checkout-monthly",externalReference:"monthly-reference",amount:5};
const historicalCasual={transactionId:"casual",checkoutId:"checkout-casual",externalReference:"casual-reference",amount:50};

test("a historical paid casual checkout is not probed for a monthly webhook with a provider checkout id",()=>{
  assert.deepEqual(selectCheckoutCandidates([historicalCasual,monthly],5,"checkout-monthly"),[monthly]);
});

test("candidate selection remains constrained by the provider amount when checkoutSession is absent",()=>{
  assert.deepEqual(selectCheckoutCandidates([historicalCasual,monthly],5,null),[monthly]);
});

test("a different payment id from an unrelated candidate is a no-match, not an operational error",()=>{
  assert.equal(checkoutResolutionDisposition(new Error("ASAAS_CHECKOUT_PAYMENT_ID_MISMATCH")),"NO_MATCH");
});

test("real candidate inconsistencies remain review-worthy",()=>{
  for(const code of ["ASAAS_CHECKOUT_PAYMENT_AMBIGUOUS","ASAAS_CHECKOUT_PAYMENT_AMOUNT_MISMATCH","ASAAS_CHECKOUT_PAYMENT_METHOD_MISMATCH","ASAAS_CHECKOUT_SESSION_MISMATCH"]){
    assert.equal(checkoutResolutionDisposition(new Error(code)),"REVIEW");
  }
});

test("not found remains a safe no-match and unknown provider errors remain visible",()=>{
  assert.equal(checkoutResolutionDisposition(new Error("ASAAS_CHECKOUT_PAYMENT_NOT_FOUND")),"NO_MATCH");
  assert.equal(checkoutResolutionDisposition(new Error("ASAAS_HTTP_503")),"ERROR");
});
