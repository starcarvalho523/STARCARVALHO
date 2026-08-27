import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? 8787);
const FORWARD_URL = process.env.EFI_WEBHOOK_FORWARD_URL ?? "https://starcarvalho.vercel.app/api/internal/efi-pix-webhook";
const FORWARD_SECRET = process.env.EFI_WEBHOOK_FORWARD_SECRET ?? "";
const URL_TOKEN = process.env.EFI_WEBHOOK_URL_TOKEN ?? "";
const MAX_BODY_BYTES = 64 * 1024;

if (!FORWARD_SECRET || !URL_TOKEN) {
  console.error("Missing EFI_WEBHOOK_FORWARD_SECRET or EFI_WEBHOOK_URL_TOKEN");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== "POST" || (url.pathname !== "/webhook" && url.pathname !== "/webhook/pix")) {
      res.writeHead(404, { "cache-control": "no-store" });
      res.end();
      return;
    }

    if (!safeEqual(url.searchParams.get("token") ?? "", URL_TOKEN)) {
      res.writeHead(401, { "cache-control": "no-store" });
      res.end();
      return;
    }

    // Efí performs a validation POST to the registered URL before callbacks begin.
    if (url.pathname === "/webhook") {
      res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
      res.end("200");
      return;
    }

    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
      res.writeHead(415, { "cache-control": "no-store" });
      res.end();
      return;
    }

    const body = await readBody(req);
    const forward = await fetch(FORWARD_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${FORWARD_SECRET}`,
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!forward.ok) {
      console.error("Forward failed", forward.status);
      res.writeHead(502, { "cache-control": "no-store" });
      res.end();
      return;
    }

    res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    res.end("200");
  } catch (error) {
    console.error("Webhook receiver error", error instanceof Error ? error.message : "unknown");
    res.writeHead(500, { "cache-control": "no-store" });
    res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Efí Pix webhook forwarder listening on 127.0.0.1:${PORT}`);
});

function safeEqual(received, expected) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readBody(req) {
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new Error("PAYLOAD_TOO_LARGE");

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_BODY_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}
