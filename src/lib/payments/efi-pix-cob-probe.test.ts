import assert from "node:assert/strict";
import test from "node:test";
import { efiPixCobProbeMethodNotAllowed, runEfiPixCobProbe } from "./efi-pix-cob-probe.ts";
import { runEfiPixConfigStagesProbe } from "./efi-pix-config-probe.ts";

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

test("Pix config stages probe returns the complete fixed safe sequence", () => {
  const configured = { ...env, EFI_CLIENT_ID: "client-value", EFI_CLIENT_SECRET: "secret-value", EFI_CERTIFICATE_BASE64: Buffer.from("p12").toString("base64"), EFI_PIX_KEY: "pix-key" } as NodeJS.ProcessEnv;
  assert.deepEqual(runEfiPixConfigStagesProbe(authorization, configured), { status: 200, body: { ok: true, stages: ["PROBE_AUTH_OK", "VERCEL_PREVIEW_OK", "EFI_ENABLED_OK", "EFI_ENVIRONMENT_SANDBOX_OK", "EFI_CLIENT_ID_OK", "EFI_CLIENT_SECRET_OK", "EFI_CERTIFICATE_BASE64_FORMAT_OK", "EFI_CERTIFICATE_BUFFER_OK", "EFI_PIX_KEY_OK", "CONFIG_CHECK_OK"] } });
});

test("Pix config stages probe stops at every deterministic validation stage without leaking values", () => {
  const configured = { ...env, EFI_CLIENT_ID: "client-value", EFI_CLIENT_SECRET: "secret-value", EFI_CERTIFICATE_BASE64: Buffer.from("p12").toString("base64"), EFI_PIX_KEY: "pix-key" } as NodeJS.ProcessEnv;
  const cases = [
    [null, configured, undefined, "PROBE_AUTH_FAILED"],
    [authorization, { ...configured, VERCEL_ENV: "production" }, undefined, "VERCEL_ENV_INVALID"],
    [authorization, { ...configured, EFI_ENABLED: "false" }, undefined, "EFI_ENABLED_INVALID"],
    [authorization, { ...configured, EFI_ENVIRONMENT: "production" }, undefined, "EFI_ENVIRONMENT_INVALID"],
    [authorization, { ...configured, EFI_CLIENT_ID: "" }, undefined, "EFI_CLIENT_ID_INVALID"],
    [authorization, { ...configured, EFI_CLIENT_SECRET: "" }, undefined, "EFI_CLIENT_SECRET_INVALID"],
    [authorization, { ...configured, EFI_CERTIFICATE_BASE64: "not-base64" }, undefined, "EFI_CERTIFICATE_BASE64_INVALID"],
    [authorization, configured, { decodeCertificate: () => Buffer.alloc(0) }, "EFI_CERTIFICATE_DECODE_INVALID"],
    [authorization, { ...configured, EFI_PIX_KEY: "" }, undefined, "EFI_PIX_KEY_INVALID"],
    [authorization, configured, { resolveConfig: () => { throw new Error("raw provider detail"); } }, "EFI_CONFIG_RESOLVER_UNKNOWN"],
  ] as const;
  for (const [candidateAuthorization, candidateEnvironment, dependencies, expected] of cases) {
    const result = runEfiPixConfigStagesProbe(candidateAuthorization, candidateEnvironment, dependencies);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.stages.at(-1), expected);
    assert.doesNotMatch(JSON.stringify(result.body), /client-value|secret-value|p12|pix-key|probe-token|raw provider detail/i);
  }
});
