import assert from "node:assert/strict";
import test from "node:test";
import { createImmediateEfiPixCob, EfiPixClient } from "./efi-pix-client.ts";
import type { EfiPixRuntimeConfig } from "./efi-config.ts";
import type { EfiHttpRequest, EfiHttpResponse, EfiHttpTransport } from "./efi-http-client.ts";

const config: EfiPixRuntimeConfig = { environment: "sandbox", providerEnvironment: "SANDBOX", baseUrl: "https://pix-h.api.efipay.com.br", clientId: "client", clientSecret: "secret-value", certificateP12: Buffer.from("p12"), pixKey: "pix-key-secret", payeeCode: null };
class FakeTransport implements EfiHttpTransport { last?: EfiHttpRequest; constructor(private readonly response: EfiHttpResponse | Error) {} async request(request: EfiHttpRequest) { this.last = request; if (this.response instanceof Error) throw this.response; return this.response; } }
const oauth = { getAccessToken: async () => ({ accessToken: "access-token-secret", tokenType: "Bearer", expiresIn: 3600, scope: "pix" }) };
const success = { status: 201, body: JSON.stringify({ txid: "txid-123", status: "ATIVA", loc: { id: 42 } }) };
test("creates a sandbox Cob using POST, Bearer, configured Pix key, and two-decimal amount", async () => {
  const transport = new FakeTransport(success); const result = await new EfiPixClient(config, { oauth, transport }).createImmediateCob({ amount: 5, expiresInSeconds: 3600 });
  assert.deepEqual(result, { txid: "txid-123", status: "ATIVA", locationId: 42, pixCopyPaste: null }); assert.equal(transport.last?.path, "/v2/cob"); assert.equal(transport.last?.method, "POST"); assert.equal(transport.last?.headers.authorization, "Bearer access-token-secret");
  assert.deepEqual(JSON.parse(transport.last?.body ?? ""), { calendario: { expiracao: 3600 }, valor: { original: "5.00" }, chave: "pix-key-secret", solicitacaoPagador: "Pagamento estacionamento Star Carvalhos" });
});
test("formats only amounts that are already exact positive cent values", async () => {
  for (const [amount, expected] of [[5, "5.00"], [5.1, "5.10"], [5.01, "5.01"]] as const) {
    const transport = new FakeTransport(success);
    await new EfiPixClient(config, { oauth, transport }).createImmediateCob({ amount });
    const payload = JSON.parse(transport.last?.body ?? "") as { valor: { original: string } };
    assert.equal(payload.valor.original, expected);
  }

  for (const amount of [5.001, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const transport = new FakeTransport(success);
    await assert.rejects(() => new EfiPixClient(config, { oauth, transport }).createImmediateCob({ amount }), /EFI_PIX_CREATE_FAILED/);
    assert.equal(transport.last, undefined);
  }
});
test("requires Pix key and keeps production fail-closed before any request", async () => {
  const base = { EFI_ENABLED: "true", EFI_ENVIRONMENT: "sandbox", EFI_CLIENT_ID: "client", EFI_CLIENT_SECRET: "secret", EFI_CERTIFICATE_BASE64: Buffer.from("p12").toString("base64") } as unknown as NodeJS.ProcessEnv;
  assert.throws(() => createImmediateEfiPixCob({ amount: 5 }, { env: base }), /EFI_PIX_KEY_MISSING/);
  assert.throws(() => createImmediateEfiPixCob({ amount: 5 }, { env: { ...base, EFI_ENVIRONMENT: "production", EFI_PIX_KEY: "key" } }), /EFI_PIX_PRODUCTION_DISABLED/);
});
test("sanitizes provider failures, timeout, and invalid responses without secrets", async () => {
  for (const response of [{ status: 400, body: JSON.stringify({ detail: "access-token-secret pix-key-secret secret-value" }) }, new Error("EFI_TIMEOUT"), { status: 201, body: "{}" }]) {
    const transport = new FakeTransport(response); await assert.rejects(() => new EfiPixClient(config, { oauth, transport }).createImmediateCob({ amount: 5 }), error => error instanceof Error && !error.message.includes("secret") && ["EFI_PIX_CREATE_FAILED", "EFI_TIMEOUT", "EFI_INVALID_RESPONSE"].includes(error.message));
  }
});
