import assert from "node:assert/strict";
import test from "node:test";
import { MercadoPagoPointProvider } from "./mercado-pago-point-provider.ts";

const provider=new MercadoPagoPointProvider();
test("Point remains unavailable without a terminal",()=>assert.deepEqual(provider.evaluateReadiness([],false),{terminalReady:false,operational:false,reason:"AWAITING_TERMINAL"}));
test("disabled and standalone terminals remain unavailable",()=>{
  assert.equal(provider.evaluateReadiness([{enabled:false,status:"DISABLED",operatingMode:"PDV"}],true).operational,false);
  assert.equal(provider.evaluateReadiness([{enabled:true,status:"READY",operatingMode:"STANDALONE"}],true).operational,false);
});
test("a READY PDV terminal is architecturally eligible but feature-disabled",()=>assert.deepEqual(provider.evaluateReadiness([{enabled:true,status:"READY",operatingMode:"PDV"}],false),{terminalReady:true,operational:false,reason:"INTEGRATION_DISABLED"}));
test("eligibility requires both READY PDV and explicit integration activation",()=>assert.deepEqual(provider.evaluateReadiness([{enabled:true,status:"READY",operatingMode:"PDV"}],true),{terminalReady:true,operational:true,reason:"READY"}));

