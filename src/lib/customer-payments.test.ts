import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerPaymentHistory, findCustomerPayment, formatBillingCompetence, paymentDisplayStatus } from "./customer-payments.ts";

const paidParking = { id:"park-pay", amount:12, method:"CASH", status:"PAID", provider:null, paid_at:"2026-08-11T10:00:00Z", created_at:"2026-08-11T09:59:00Z" };
const paidMonthly = { id:"monthly-pay", amount:5, method:"PIX", status:"PAID", provider:"ASAAS", paid_at:"2026-08-12T11:18:00Z", created_at:"2026-08-12T11:10:00Z" };
const session = { plate_snapshot:"ABC1D23", vehicle_type:"CAR", entered_at:"2026-08-11T08:00:00Z", exited_at:"2026-08-11T10:00:00Z", parking_units:{name:"Central",timezone:"America/Bahia"}, payments:[paidParking] };
const period = { reference_year:2026, reference_month:8, parking_units:{name:"Central",timezone:"America/Bahia"}, monthly_subscriptions:{plan_name:"Plano mensal",parking_units:{name:"Central",timezone:"America/Bahia"}}, payments:[paidMonthly] };

test("preserves a parking-session payment",()=>{const rows=buildCustomerPaymentHistory([session],[]);assert.equal(rows.length,1);assert.equal(rows[0].kind,"PARKING_SESSION");assert.equal(rows[0].payment.id,"park-pay")});
test("includes a monthly payment without a parking session",()=>{const rows=buildCustomerPaymentHistory([],[period]);assert.equal(rows.length,1);assert.equal(rows[0].kind,"MONTHLY_BILLING_PERIOD");assert.equal(formatBillingCompetence(2026,8),"08/2026")});
test("lists parking and monthly payments together in descending date order",()=>{const rows=buildCustomerPaymentHistory([session],[period]);assert.deepEqual(rows.map((row)=>row.payment.id),["monthly-pay","park-pay"])});
test("receipt lookup is limited to already-owned rows",()=>{const owned=buildCustomerPaymentHistory([],[period]);assert.equal(findCustomerPayment(owned,"monthly-pay")?.kind,"MONTHLY_BILLING_PERIOD");assert.equal(findCustomerPayment(owned,"another-customer-payment"),null)});
test("pending and failed payments are never presented as paid",()=>{assert.equal(paymentDisplayStatus("PAID"),"Pago");assert.equal(paymentDisplayStatus("PENDING"),"Pendente");assert.equal(paymentDisplayStatus("FAILED"),"Falhou")});
