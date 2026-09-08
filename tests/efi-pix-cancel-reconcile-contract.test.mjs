import fs from 'node:fs';
import assert from 'node:assert/strict';

const route = fs.readFileSync('src/app/api/payments/efi-pix/reconcile/route.ts', 'utf8');
assert.ok(route.includes('payment.status === "CANCELLED"'));
assert.ok(route.includes('latest?.status === "CANCELLED"'));
assert.ok(route.includes('state: "CANCELLED"'));
console.log('Efí PIX cancelled reconciliation contract OK');
