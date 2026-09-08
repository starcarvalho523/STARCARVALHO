import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = fs.readFileSync('next.config.ts', 'utf8');
assert.ok(config.includes('https://tokenizer.sejaefi.com.br'));
assert.ok(config.includes('https://cobrancas.api.efipay.com.br'));
assert.ok(config.includes("connect-src 'self'"));
console.log('Efí card CSP contract OK');
