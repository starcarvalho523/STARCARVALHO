import assert from "node:assert/strict";
import test from "node:test";
import { EfiPixQrClient, getEfiPixQrCode } from "./efi-pix-qr-client.ts";
import type { EfiAuthRuntimeConfig } from "./efi-config.ts";
import type { EfiHttpRequest, EfiHttpResponse, EfiHttpTransport } from "./efi-http-client.ts";

const config: EfiAuthRuntimeConfig = { environment: "sandbox", providerEnvironment: "SANDBOX", baseUrl: "https://pix-h.api.efipay.com.br", clientId: "client", clientSecret: "secret", certificateP12: Buffer.from("p12") };
class FakeTransport implements EfiHttpTransport { last?: EfiHttpRequest; constructor(private readonly response: EfiHttpResponse) {} async request(request: EfiHttpRequest) { this.last = request; return this.response; } }
const oauth = { getAccessToken: async () => ({ accessToken: "access-token-secret", tokenType: "Bearer", expiresIn: 3600, scope: "payloadlocation.read" }) };

test("gets a QR code using the fixed Efí sandbox host, GET, and Bearer", async () => {
  const transport = new FakeTransport({ status: 200, body: JSON.stringify({ qrcode: "payload", imagemQrcode: "image" }) });
  const result = await new EfiPixQrClient(config, { oauth, transport }).getQrCode(42);
  assert.deepEqual(result, { qrPayload: "payload", qrImageDataUri: "data:image/png;base64,image" });
  assert.equal(config.baseUrl, "https://pix-h.api.efipay.com.br"); assert.equal(transport.last?.method, "GET"); assert.equal(transport.last?.path, "/v2/loc/42/qrcode"); assert.equal(transport.last?.headers.authorization, "Bearer access-token-secret");
});

test("preserves an Efí QR image that already arrives as a data URI", async () => {
  const image = "data:image/png;base64,already-prefixed";
  const transport = new FakeTransport({ status: 200, body: JSON.stringify({ qrcode: "payload", imagemQrcode: image }) });
  const result = await new EfiPixQrClient(config, { oauth, transport }).getQrCode(42);
  assert.equal(result.qrImageDataUri, image);
});

test("rejects invalid location ids before OAuth or HTTP", async () => {
  for (const locationId of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    let oauthCalled = false; const transport = new FakeTransport({ status: 200, body: "{}" });
    await assert.rejects(() => new EfiPixQrClient(config, { oauth: { getAccessToken: async () => { oauthCalled = true; return oauth.getAccessToken(); } }, transport }).getQrCode(locationId), /EFI_PIX_QR_FAILED/);
    assert.equal(oauthCalled, false); assert.equal(transport.last, undefined);
  }
});

test("normalizes QR responses and sanitizes provider errors", async () => {
  for (const [response, expected] of [
    [{ status: 200, body: JSON.stringify({ qrcode: "payload" }) }, null],
    [{ status: 400, body: JSON.stringify({ nome: "location_nao_encontrada", mensagem: "secret", detail: "secret" }) }, "EFI_PIX_QR_FAILED:400:location_nao_encontrada"],
    [{ status: 400, body: JSON.stringify({ nome: "unknown", mensagem: "secret", detail: "secret" }) }, "EFI_PIX_QR_FAILED:400:provider_error"],
    [{ status: 200, body: "{}" }, "EFI_INVALID_RESPONSE"],
  ] as const) {
    const transport = new FakeTransport(response); const client = new EfiPixQrClient(config, { oauth, transport });
    if (expected === null) assert.deepEqual(await client.getQrCode(1), { qrPayload: "payload", qrImageDataUri: null });
    else await assert.rejects(() => client.getQrCode(1), error => error instanceof Error && error.message === expected && !error.message.includes("secret"));
  }
});

test("keeps production blocked before any request", () => {
  const env = { EFI_ENABLED: "true", EFI_ENVIRONMENT: "production", EFI_CLIENT_ID: "client", EFI_CLIENT_SECRET: "secret", EFI_CERTIFICATE_BASE64: Buffer.from("p12").toString("base64") } as unknown as NodeJS.ProcessEnv;
  assert.throws(() => getEfiPixQrCode(1, { env }), /EFI_PRODUCTION_DISABLED/);
});
