import assert from "node:assert/strict";
import test from "node:test";
import { efiPixCobProbeMethodNotAllowed, runEfiPixCobProbe } from "./efi-pix-cob-probe.ts";

const env = { VERCEL_ENV: "preview", EFI_PIX_PROBE_TOKEN: "probe-token", EFI_ENABLED: "true", EFI_ENVIRONMENT: "sandbox" } as unknown as NodeJS.ProcessEnv;
const authorization = "Bearer probe-token";
const cob = { txid: "must-not-leak", status: "ATIVA", locationId: 42, pixCopyPaste: "must-not-leak" };

test("Pix Cob probe exposes POST only", () => {
  assert.deepEqual(efiPixCobProbeMethodNotAllowed, { ok: false, error: "EFI_PROBE_UNAUTHORIZED" });
});

test("Pix Cob probe blocks missing or invalid tokens before any provider call", async () => {
  for (const candidate of [null, "Bearer incorrect"]) {
    let called = false;
    const result = await runEfiPixCobProbe(candidate, env, { createCob: async () => { called = true; return cob; } });
    assert.deepEqual(result, { status: 401, body: { ok: false, error: "EFI_PROBE_UNAUTHORIZED" } });
    assert.equal(called, false);
  }
});

test("Pix Cob probe blocks unsafe runtime values before any provider call", async () => {
  for (const candidate of [{ ...env, VERCEL_ENV: "production" }, { ...env, EFI_ENABLED: "false" }, { ...env, EFI_ENVIRONMENT: "production" }]) {
    let called = false;
    const result = await runEfiPixCobProbe(authorization, candidate, { createCob: async () => { called = true; return cob; } });
    assert.deepEqual(result, { status: 400, body: { ok: false, error: "EFI_WRONG_ENVIRONMENT" } });
    assert.equal(called, false);
  }
});

test("Pix Cob probe returns only sanitized metadata after every guard", async () => {
  let called = false;
  const result = await runEfiPixCobProbe(authorization, env, { createCob: async () => { called = true; return cob; } });
  assert.equal(called, true);
  assert.deepEqual(result, { status: 200, body: { ok: true, environment: "sandbox", amount: "5.00", status: "ATIVA", txidPresent: true, locationIdPresent: true, pixCopyPastePresent: true } });
  assert.doesNotMatch(JSON.stringify(result.body), /must-not-leak|probe-token|access-token|client-secret|certificate|pix-key/i);
});

test("Pix Cob probe maps failures to sanitized codes", async () => {
  for (const [error, status, code] of [["EFI_TIMEOUT", 504, "EFI_TIMEOUT"], ["EFI_PIX_KEY_MISSING", 400, "EFI_PIX_KEY_MISSING"], ["EFI_CERTIFICATE_MISSING", 502, "EFI_CERTIFICATE_INVALID"], ["raw provider failure", 502, "EFI_PIX_CREATE_FAILED"]] as const) {
    const result = await runEfiPixCobProbe(authorization, env, { createCob: async () => { throw new Error(error); } });
    assert.deepEqual(result, { status, body: { ok: false, error: code } });
  }
});
