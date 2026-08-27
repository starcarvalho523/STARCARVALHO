import assert from "node:assert/strict";
import test from "node:test";

import { buildEfiPixServerlessWebhookUrl, EfiPixWebhookClient } from "./efi-pix-webhook-client.ts";
import type { EfiPixRuntimeConfig } from "./efi-config.ts";

const config: EfiPixRuntimeConfig = {
  environment: "production",
  providerEnvironment: "PRODUCTION",
  baseUrl: "https://pix.api.efipay.com.br",
  clientId: "client",
  clientSecret: "secret",
  certificateP12: Buffer.from("p12"),
  pixKey: "pix-key@example.com",
  payeeCode: null,
};

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

test("builds a HTTPS webhook URL with HMAC and Efí /pix compatibility suffix", () => {
  const value = buildEfiPixServerlessWebhookUrl(env({
    NEXT_PUBLIC_SITE_URL: "https://starcarvalho.vercel.app/",
    EFI_PIX_WEBHOOK_HMAC_SECRET: "abc123",
  }));
  const url = new URL(value);
  assert.equal(url.origin, "https://starcarvalho.vercel.app");
  assert.equal(url.pathname, "/api/webhooks/efi-pix");
  assert.equal(url.searchParams.get("hmac"), "abc123");
  assert.equal(url.searchParams.has("ignorar"), true);
});

test("fails closed when webhook URL configuration is incomplete", () => {
  assert.throws(() => buildEfiPixServerlessWebhookUrl(env({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })), /EFI_PIX_WEBHOOK_NOT_CONFIGURED/);
});

test("registers webhook with skip-mTLS header and exact production Pix key", async () => {
  let captured: unknown;
  const client = new EfiPixWebhookClient(config, {
    oauth: { getAccessToken: async () => ({ accessToken: "token", expiresIn: 3600, tokenType: "Bearer", scope: "webhook.write" }) },
    transport: { request: async (request) => { captured = request; return { status: 201, body: "" }; } },
  });
  await client.configureServerlessWebhook("https://starcarvalho.vercel.app/api/webhooks/efi-pix?hmac=abc&ignorar=");
  assert.deepEqual(captured, {
    path: "/v2/webhook/pix-key%40example.com",
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer token",
      "x-skip-mtls-checking": "true",
    },
    body: JSON.stringify({ webhookUrl: "https://starcarvalho.vercel.app/api/webhooks/efi-pix?hmac=abc&ignorar=" }),
  });
});
