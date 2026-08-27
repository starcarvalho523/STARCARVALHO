import assert from "node:assert/strict";
import test from "node:test";

import { POST, setEfiPixPublicWebhookProcessorForTests } from "./route.ts";

const secret = "test-webhook-hmac";
const ip = "34.193.116.226";
const payload = {
  pix: [{ txid: "B".repeat(26), endToEndId: "E2E123", valor: "5.00", horario: "2026-08-27T12:00:00Z" }],
};

function req(body: unknown, options: { hmac?: string; sourceIp?: string; contentType?: string; rawBody?: string } = {}) {
  const url = new URL("https://example.test/api/webhooks/efi-pix");
  if (options.hmac !== undefined) url.searchParams.set("hmac", options.hmac);
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": options.contentType ?? "application/json",
      "x-forwarded-for": options.sourceIp ?? ip,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

async function withEnv<T>(action: () => Promise<T>) {
  const oldSecret = process.env.EFI_PIX_WEBHOOK_HMAC_SECRET;
  const oldIps = process.env.EFI_PIX_WEBHOOK_ALLOWED_IPS;
  process.env.EFI_PIX_WEBHOOK_HMAC_SECRET = secret;
  process.env.EFI_PIX_WEBHOOK_ALLOWED_IPS = ip;
  try { return await action(); }
  finally {
    if (oldSecret === undefined) delete process.env.EFI_PIX_WEBHOOK_HMAC_SECRET; else process.env.EFI_PIX_WEBHOOK_HMAC_SECRET = oldSecret;
    if (oldIps === undefined) delete process.env.EFI_PIX_WEBHOOK_ALLOWED_IPS; else process.env.EFI_PIX_WEBHOOK_ALLOWED_IPS = oldIps;
    setEfiPixPublicWebhookProcessorForTests(null);
  }
}

test("fails closed without valid HMAC and Efí IP", async () => {
  await withEnv(async () => {
    assert.equal((await POST(req(payload))).status, 401);
    assert.equal((await POST(req(payload, { hmac: "wrong" }))).status, 401);
    assert.equal((await POST(req(payload, { hmac: secret, sourceIp: "203.0.113.10" }))).status, 401);
  });
});

test("accepts Efí registration probe without payment effects", async () => {
  await withEnv(async () => {
    let calls = 0;
    setEfiPixPublicWebhookProcessorForTests(() => ({ processEfiPixWebhook: async () => { calls += 1; return []; } } as never));

    const probes = [
      req({}, { hmac: secret }),
      req({ evento: "teste_webhook" }, { hmac: secret }),
      req(null, { hmac: secret, rawBody: "" }),
    ];

    for (const request of probes) {
      const response = await POST(request);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, result: "EFI_WEBHOOK_PROBE_ACCEPTED" });
    }
    assert.equal(calls, 0);
  });
});

test("processes valid Pix callback exactly once through PaymentService seam", async () => {
  await withEnv(async () => {
    let calls = 0;
    setEfiPixPublicWebhookProcessorForTests(() => ({ processEfiPixWebhook: async () => { calls += 1; return []; } } as never));
    const response = await POST(req(payload, { hmac: secret }));
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  });
});
