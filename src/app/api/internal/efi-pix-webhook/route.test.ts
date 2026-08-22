import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST, setEfiWebhookProcessorForTests } from "./route.ts";

const forwardSecret = "test-forward-secret";
const validPayload = {
  pix: [{
    txid: "B".repeat(26),
    endToEndId: "E2E123",
    valor: "5.00",
    horario: "2026-08-22T00:00:00Z",
  }],
};

function request(body: string, options: { authorization?: string; contentType?: string; contentLength?: string } = {}) {
  return new Request("https://example.test/api/internal/efi-pix-webhook", {
    method: "POST",
    headers: {
      "content-type": options.contentType ?? "application/json",
      ...(options.authorization ? { authorization: options.authorization } : {}),
      ...(options.contentLength ? { "content-length": options.contentLength } : {}),
    },
    body,
  });
}

async function withSecret<T>(secret: string | undefined, action: () => Promise<T>): Promise<T> {
  const previous = process.env.EFI_WEBHOOK_FORWARD_SECRET;
  if (secret === undefined) delete process.env.EFI_WEBHOOK_FORWARD_SECRET;
  else process.env.EFI_WEBHOOK_FORWARD_SECRET = secret;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.EFI_WEBHOOK_FORWARD_SECRET;
    else process.env.EFI_WEBHOOK_FORWARD_SECRET = previous;
  }
}

test("GET is rejected", async () => {
  assert.equal(GET().status, 405);
});

test("rejects missing, invalid, and unavailable forward secrets", async () => {
  await withSecret(forwardSecret, async () => {
    assert.equal((await POST(request(JSON.stringify(validPayload)))).status, 401);
    assert.equal((await POST(request(JSON.stringify(validPayload), { authorization: "Bearer wrong" }))).status, 401);
  });
  await withSecret(undefined, async () => {
    assert.equal((await POST(request(JSON.stringify(validPayload), { authorization: `Bearer ${forwardSecret}` }))).status, 401);
  });
});

test("validates media type, body size, JSON, and Pix payload without side effects", async () => {
  await withSecret(forwardSecret, async () => {
    const auth = `Bearer ${forwardSecret}`;
    assert.equal((await POST(request(JSON.stringify(validPayload), { authorization: auth, contentType: "text/plain" }))).status, 415);
    assert.equal((await POST(request("{", { authorization: auth }))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ pix: [{ ...validPayload.pix[0], txid: "bad" }] }), { authorization: auth }))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ pix: [{ ...validPayload.pix[0], endToEndId: "invalid/id" }] }), { authorization: auth }))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ pix: [{ ...validPayload.pix[0], valor: "5.001" }] }), { authorization: auth }))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ pix: [{ ...validPayload.pix[0], horario: "invalid" }] }), { authorization: auth }))).status, 400);
    assert.equal((await POST(request("x".repeat(65 * 1024), { authorization: auth, contentLength: String(65 * 1024) }))).status, 413);

    let persisted = 0;
    setEfiWebhookProcessorForTests(() => ({ processEfiPixWebhook: async () => { persisted += 1; return ["processed"]; } }));
    const response = await POST(request(JSON.stringify({ ...validPayload, extra: "ignored", pix: [{ ...validPayload.pix[0], extra: "ignored" }] }), { authorization: auth }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, result: "EFI_WEBHOOK_ACCEPTED" });
    assert.equal(persisted, 1);
    setEfiWebhookProcessorForTests(null);
  });
});
