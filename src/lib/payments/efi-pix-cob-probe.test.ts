import assert from "node:assert/strict";
import test from "node:test";
import { efiPixCobProbeMethodNotAllowed, runEfiPixCobProbe } from "./efi-pix-cob-probe.ts";
import { runEfiPixConfigProbe } from "./efi-pix-config-probe.ts";

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

test("Pix Cob probe keeps only validated HTTP diagnostics", async () => {
  const allowed = await runEfiPixCobProbe(authorization, env, { createCob: async () => { throw new Error("EFI_PIX_CREATE_FAILED:400:chave_invalida"); } });
  assert.deepEqual(allowed, { status: 502, body: { ok: false, error: "EFI_PIX_CREATE_FAILED:400:chave_invalida" } });

  const rejected = await runEfiPixCobProbe(authorization, env, { createCob: async () => { throw new Error("EFI_PIX_CREATE_FAILED:400:secret-value"); } });
  assert.deepEqual(rejected, { status: 502, body: { ok: false, error: "EFI_PIX_CREATE_FAILED" } });
});

test("Pix config probe resolves only configuration and returns presence booleans", () => {
  const configured = { ...env, EFI_CLIENT_ID: "client-value", EFI_CLIENT_SECRET: "secret-value", EFI_CERTIFICATE_BASE64: Buffer.from("p12").toString("base64"), EFI_PIX_KEY: "pix-key" } as NodeJS.ProcessEnv;
  assert.deepEqual(runEfiPixConfigProbe(authorization, configured), { status: 200, body: { ok: true, result: "CONFIG_CHECK_OK", presence: { EFI_ENABLED_PRESENT: true, EFI_ENVIRONMENT_PRESENT: true, EFI_CLIENT_ID_PRESENT: true, EFI_CLIENT_SECRET_PRESENT: true, EFI_CERTIFICATE_BASE64_PRESENT: true, EFI_PIX_KEY_PRESENT: true } } });
});

test("Pix config probe exposes only safe resolver errors and never values", () => {
  const configured = { ...env, EFI_CLIENT_ID: "client-value", EFI_CLIENT_SECRET: "secret-value", EFI_CERTIFICATE_BASE64: Buffer.from("p12").toString("base64"), EFI_PIX_KEY: "pix-key" } as NodeJS.ProcessEnv;
  for (const [candidate, expected] of [[{ ...configured, EFI_ENABLED: "false" }, "EFI_DISABLED"], [{ ...configured, EFI_ENVIRONMENT: "" }, "EFI_ENVIRONMENT_NOT_CONFIGURED"], [{ ...configured, EFI_ENVIRONMENT: "production" }, "EFI_PRODUCTION_DISABLED"], [{ ...configured, EFI_CLIENT_ID: "" }, "EFI_CLIENT_ID_MISSING"], [{ ...configured, EFI_CLIENT_SECRET: "" }, "EFI_CLIENT_SECRET_MISSING"], [{ ...configured, EFI_CERTIFICATE_BASE64: "" }, "EFI_CERTIFICATE_MISSING"], [{ ...configured, EFI_CERTIFICATE_BASE64: "not-valid" }, "EFI_CERTIFICATE_INVALID"], [{ ...configured, EFI_PIX_KEY: "" }, "EFI_PIX_KEY_MISSING"]] as const) {
    const result = runEfiPixConfigProbe(authorization, candidate);
    assert.equal(result.body.ok, false); if (!result.body.ok) assert.equal(result.body.error, expected);
    assert.doesNotMatch(JSON.stringify(result.body), /client-value|secret-value|p12|pix-key|probe-token/i);
  }
});
