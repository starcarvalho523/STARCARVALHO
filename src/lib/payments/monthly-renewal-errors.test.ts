import assert from "node:assert/strict";
import test from "node:test";
import { AsaasPublicError } from "./asaas-provider.ts";
import { classifyCardActivationError, classifyRenewalActionError, isAmbiguousRecurringCreationError } from "./monthly-renewal-errors.ts";

test("400 genérico do Asaas não é rotulado como cartão recusado",()=>{
  const result=classifyCardActivationError(new AsaasPublicError(400,"invalid_externalReference","externalReference inválido"));
  assert.equal(result.status,422);
  assert.equal(result.code,"PROVIDER_REQUEST_REJECTED");
  assert.match(result.message,/cartão não foi classificado como recusado/i);
});

test("400 específico de cartão recebe mensagem de cartão",()=>{
  const result=classifyCardActivationError(new AsaasPublicError(400,"invalid_creditCard","credit card number invalid"));
  assert.equal(result.status,400);
  assert.equal(result.code,"CARD_DATA_REJECTED");
});

test("mismatch de recorrência pede reconciliação e bloqueia reenvio",()=>{
  const result=classifyCardActivationError(new Error("RENEWAL_PROVIDER_SUBSCRIPTION_MISMATCH"));
  assert.equal(result.status,409);
  assert.equal(result.code,"RENEWAL_RECONCILIATION_REQUIRED");
  assert.match(result.message,/não cadastre o cartão novamente/i);
});

test("cobrança ainda não visível é sincronização pendente",()=>{
  const result=classifyCardActivationError(new Error("RENEWAL_PROVIDER_INITIAL_CHARGE_NOT_READY"));
  assert.equal(result.status,409);
  assert.equal(result.code,"RENEWAL_SYNC_PENDING");
});

test("timeout depois do POST é ambíguo e deve ser reconciliado",()=>{
  assert.equal(isAmbiguousRecurringCreationError(new Error("TimeoutError")),true);
  assert.equal(isAmbiguousRecurringCreationError(new Error("AbortError")),true);
  assert.equal(isAmbiguousRecurringCreationError(new AsaasPublicError(503,"temporarily_unavailable",null)),true);
});

test("400 de regra não é erro ambíguo de criação",()=>{
  assert.equal(isAmbiguousRecurringCreationError(new AsaasPublicError(400,"invalid_externalReference",null)),false);
});

test("ação com falha interna não vira 503",()=>{
  const result=classifyRenewalActionError(new Error("SOME_INTERNAL_DATABASE_ERROR"));
  assert.equal(result.status,500);
  assert.equal(result.retryable,false);
});
