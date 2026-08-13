import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20260812010000_monthly_billing_payments.sql",import.meta.url),"utf8");

test("monthly payments use explicit subjects and an XOR constraint",()=>{
 assert.match(migration,/payment_subject_type/);
 assert.match(migration,/payments_subject_xor_check/);
 assert.match(migration,/monthly_billing_period_id is null/);
 assert.match(migration,/parking_session_id is null/);
});
test("monthly amount is sourced from the billing period",()=>{
 assert.match(migration,/period_row\.amount/);
 assert.doesNotMatch(migration,/request_amount|supplied_amount/);
});
test("all methods share the same obligation lock",()=>{
 const occurrences=migration.match(/MONTHLY_BILLING_PERIOD:/g)??[];
 assert.ok(occurrences.length>=2);
 assert.match(migration,/MONTHLY_PAYMENT_METHOD_CHANGE_BLOCKED/);
});
test("monthly settlement does not create a parking session",()=>{
 const monthlyInsert=migration.match(/insert into public\.payments[\s\S]*?values\([\s\S]*?MONTHLY_BILLING_PERIOD[\s\S]*?\);/)?.[0]??"";
 assert.match(monthlyInsert,/null/);
 assert.doesNotMatch(migration,/insert into public\.parking_sessions/);
});
test("checkout PAYMENT_CREATED only links while PAYMENT_CONFIRMED settles once",()=>{
 const checkoutWebhook=migration.match(/create or replace function private\.process_asaas_checkout_payment_webhook\([\s\S]*?return 'PROCESSED';\r?\nend \$\$;/)?.[0]??"";
 assert.match(checkoutWebhook,/if target_event_type='PAYMENT_CONFIRMED' then[\s\S]*?mark_payment_subject_paid\(p\.id,false\)/);
 assert.doesNotMatch(checkoutWebhook,/if target_event_type='PAYMENT_CREATED' then[\s\S]*?mark_payment_subject_paid/);
 assert.match(checkoutWebhook,/if event_state='PROCESSED' then return 'DUPLICATE'; end if/);
});
