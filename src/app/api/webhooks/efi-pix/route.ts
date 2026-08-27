import { timingSafeEqual } from "node:crypto";

import { PaymentService } from "@/lib/payments/payment-service";
import { parseEfiPixWebhook } from "@/lib/payments/efi-pix-webhook-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_EFI_WEBHOOK_IP = "34.193.116.226";

type Processor = Pick<PaymentService, "processEfiPixWebhook">;
let processorFactory: () => Processor = () => new PaymentService();

/** Test seam only. Production uses PaymentService. */
export function setEfiPixPublicWebhookProcessorForTests(factory: (() => Processor) | null) {
  processorFactory = factory ?? (() => new PaymentService());
}

export function GET() {
  return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export async function POST(request: Request) {
  if (!isAuthorizedOrigin(request)) {
    return Response.json({ error: "EFI_WEBHOOK_UNAUTHORIZED" }, { status: 401 });
  }

  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return Response.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  }

  try {
    const body = await readBodyWithinLimit(request);

    // Efí sends a validation notification when the webhook is registered.
    // A valid empty JSON object/array is acknowledged without financial effects.
    const parsed = JSON.parse(body);
    if (isRegistrationProbe(parsed)) {
      return Response.json({ ok: true, result: "EFI_WEBHOOK_PROBE_ACCEPTED" });
    }

    const events = parseEfiPixWebhook(parsed);
    await processorFactory().processEfiPixWebhook(events);
    return Response.json({ ok: true, result: "EFI_WEBHOOK_ACCEPTED" });
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    return Response.json({ error: "EFI_WEBHOOK_INVALID" }, { status: 400 });
  }
}

export function isAuthorizedOrigin(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const expectedSecret = env.EFI_PIX_WEBHOOK_HMAC_SECRET ?? "";
  if (!expectedSecret) return false;

  const provided = new URL(request.url).searchParams.get("hmac") ?? "";
  if (!safeEqual(provided, expectedSecret)) return false;

  const allowedIps = (env.EFI_PIX_WEBHOOK_ALLOWED_IPS ?? DEFAULT_EFI_WEBHOOK_IP)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedIps.length === 0) return false;

  const sourceIp = getSourceIp(request.headers);
  return sourceIp !== null && allowedIps.includes(sourceIp);
}

function getSourceIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip")?.trim() || null;
}

function safeEqual(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isRegistrationProbe(payload: unknown): boolean {
  if (Array.isArray(payload)) return payload.length === 0;
  return !!payload && typeof payload === "object" && Object.keys(payload as Record<string, unknown>).length === 0;
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
