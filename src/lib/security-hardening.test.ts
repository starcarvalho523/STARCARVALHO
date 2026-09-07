import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { BodyTooLargeError, readBoundedBody, readBoundedJson } from "./bounded-body.ts";

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

test("JSON parsing is bounded, preserves valid values and rejects malformed input", async () => {
  const request = (body: string) => new Request("https://example.test", { method: "POST", body });
  assert.deepEqual(await readBoundedJson(request('{"sessionId":"test"}')), { sessionId: "test" });
  await assert.rejects(readBoundedJson(request("{")), SyntaxError);
  await assert.rejects(readBoundedJson(request(JSON.stringify({ value: "x".repeat(65536) }))), BodyTooLargeError);
});

test("stream overflow cancels further body consumption", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(8193)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://example.test", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(request, 8192), BodyTooLargeError);
  assert.equal(cancelled, true);
});

test("API JSON entry points cannot silently return to unbounded parsing", () => {
  function inspect(directory: URL) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) inspect(path);
      else if (entry.name === "route.ts") {
        assert.doesNotMatch(readFileSync(path, "utf8"), /request\.json\s*\(/, path.pathname);
      }
    }
  }
  inspect(new URL("../app/api/", import.meta.url));
});

test("Asaas webhook keeps authentication before parsing and redacts arbitrary errors", () => {
  const source = readFileSync(new URL("../app/api/webhooks/asaas/route.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("if (!safeTokenEquals") < source.indexOf("await readBoundedJson"));
  assert.match(source, /readBoundedJson\(request, 1024 \* 1024\)/);
  assert.match(source, /REDACTED_PROCESSING_ERROR/);
  assert.doesNotMatch(source, /errorCode:\s*errorCode\.slice/);
});
