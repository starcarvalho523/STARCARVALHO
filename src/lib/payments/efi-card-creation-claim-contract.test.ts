import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("./efi-card-service.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("./efi-credit-card-client.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20260824032500_efi_card_creation_claim.sql", import.meta.url), "utf8");

test("Efí card creation is claimed before the provider POST", () => {
  const claim = service.indexOf('rpc("claim_efi_card_creation"');
  const provider = service.indexOf("createEfiOneStep({");
  const complete = service.indexOf('rpc("complete_efi_card_creation"');
  assert.ok(claim >= 0 && provider > claim && complete > provider);
});

test("uncertain provider outcomes are persisted and block blind retries", () => {
  assert.match(migration, /'UNCERTAIN'/);
  assert.match(migration, /'FAILED_BEFORE_PROVIDER'/);
  assert.match(migration, /'REJECTED'/);
  assert.match(service, /context\.creationState/);
  assert.match(service, /EFI_CARD_CREATION_/);
  assert.match(service, /mark_efi_card_creation_failure/);
});

test("provider errors carry sanitized stage and outbound certainty", () => {
  assert.match(client, /readonly stage: EfiCardErrorStage/);
  assert.match(client, /readonly providerPostSent: boolean/);
  assert.match(client, /readonly uncertain: boolean/);
  assert.match(client, /EFI_CARD_PROVIDER_NETWORK_UNCERTAIN/);
  assert.match(client, /EFI_CARD_PROVIDER_RESPONSE_UNCERTAIN/);
});

test("creation-attempt persistence never stores card secrets", () => {
  assert.doesNotMatch(migration, /payment_token/i);
  assert.doesNotMatch(migration, /\bpan\b/i);
  assert.doesNotMatch(migration, /\bcvv\b/i);
});
