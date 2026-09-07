import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BodyTooLargeError, readBoundedBody } from "./bounded-body.ts";

test("rejects oversized bodies without a length header or with a forged small length", async () => {
  for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
    const request = new Request("https://example.test", { method: "POST", headers, body: "x".repeat(8193) });
    await assert.rejects(readBoundedBody(request, 8192), BodyTooLargeError);
  }
});

test("accepts the exact byte limit and preserves multipart form parsing", async () => {
  const request = new Request("https://example.test", { method: "POST", body: "x".repeat(8192) });
  assert.equal((await readBoundedBody(request, 8192)).length, 8192);
  const form = new FormData();
  form.set("notification", "test-notification");
  const multipart = new Request("https://example.test", { method: "POST", body: form });
  const bytes = await readBoundedBody(multipart, 8192);
  const parsed = await new Response(Buffer.from(bytes), { headers: { "content-type": multipart.headers.get("content-type")! } }).formData();
  assert.equal(parsed.get("notification"), "test-notification");
});

test("measures UTF-8 bytes rather than characters", async () => {
  await assert.rejects(readBoundedBody(new Request("https://example.test", { method: "POST", body: "é".repeat(4097) }), 8192), BodyTooLargeError);
});

test("authentication provisioning never overwrites an existing disabled profile", () => {
  for (const file of ["login/actions.ts", "cadastro/actions.ts", "auth/callback/route.ts"]) {
    const source = readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8");
    assert.match(source, /ignoreDuplicates: true/);
    assert.doesNotMatch(source, /is_active:\s*true/);
  }
});
