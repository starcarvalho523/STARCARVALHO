import { timingSafeEqual } from "node:crypto";

import { parseEfiPixWebhook } from "../../../../lib/payments/efi-pix-webhook-contract.ts";
import type { EfiPixWebhookEvent } from "../../../../lib/payments/efi-pix-webhook-contract.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const UNAUTHORIZED = { error: "EFI_WEBHOOK_UNAUTHORIZED" };
type WebhookProcessor = { processEfiPixWebhook(events: readonly EfiPixWebhookEvent[]): Promise<unknown> };
const realProcessorFactory = async (): Promise<WebhookProcessor> => {
  const { PaymentService } = await import("../../../../lib/payments/payment-service.ts");
  return new PaymentService();
};
let processorFactory: () => Promise<WebhookProcessor> = realProcessorFactory;
/** Test seam; production always constructs the real PaymentService. */
export function setEfiWebhookProcessorForTests(factory: (() => WebhookProcessor) | null) { processorFactory = factory ? async () => factory() : realProcessorFactory; }

export function GET() {
  return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.EFI_WEBHOOK_FORWARD_SECRET)) {
    return Response.json(UNAUTHORIZED, { status: 401 });
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    return Response.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  }

  try {
    const body = await readBodyWithinLimit(request);
    const events = parseEfiPixWebhook(JSON.parse(body));

    await (await processorFactory()).processEfiPixWebhook(events);

    return Response.json({ ok: true, result: "EFI_WEBHOOK_ACCEPTED" });
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    return Response.json({ error: "EFI_WEBHOOK_INVALID" }, { status: 400 });
  }
}

function isAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const received = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isJsonContentType(contentType: string | null): boolean {
  return /^application\/json(?:\s*;|$)/i.test(contentType ?? "");
}

async function readBodyWithinLimit(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    throw new BodyTooLargeError();
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new BodyTooLargeError();
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

class BodyTooLargeError extends Error {}
