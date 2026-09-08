import { timingSafeEqual } from "node:crypto";

import { PaymentService } from "@/lib/payments/payment-service";
import { parseEfiPixWebhook, type EfiPixWebhookEvent } from "@/lib/payments/efi-pix-webhook-contract";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_EFI_WEBHOOK_IP = "34.193.116.226";

type Processor = Pick<PaymentService, "processEfiPixWebhook">;
type FinancialEnricher = (events: readonly EfiPixWebhookEvent[]) => Promise<void>;
let processorFactory: () => Processor = () => new PaymentService();
let financialEnricher: FinancialEnricher = enrichEfiPixFinancials;

/** Test seam only. Production uses PaymentService. */
export function setEfiPixPublicWebhookProcessorForTests(factory: (() => Processor) | null) {
  processorFactory = factory ?? (() => new PaymentService());
}

/** Test seam only. Production persists provider reference and optional tariff. */
export function setEfiPixFinancialEnricherForTests(enricher: FinancialEnricher | null) {
  financialEnricher = enricher ?? enrichEfiPixFinancials;
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

    // Efí may send the registration validation POST with an empty body. The
    // request has already passed HMAC + source IP validation, so acknowledge it
    // without invoking any financial processing.
    if (body.trim() === "") {
      return Response.json({ ok: true, result: "EFI_WEBHOOK_PROBE_ACCEPTED" });
    }

    const parsed = JSON.parse(body);

    // During webhook registration Efí sends a validation POST to the exact URL.
    // Their reference implementation only requires a 2xx response for this probe;
    // the probe body is not guaranteed to match a Pix callback payload. Because the
    // request has already passed both the HMAC and Efí IP checks, acknowledge any
    // JSON payload that is not a real `pix` callback without financial side effects.
    if (!hasPixEvents(parsed)) {
      return Response.json({ ok: true, result: "EFI_WEBHOOK_PROBE_ACCEPTED" });
    }

    const events = parseEfiPixWebhook(parsed);
    await processorFactory().processEfiPixWebhook(events);
    await financialEnricher(events);
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

async function enrichEfiPixFinancials(events: readonly EfiPixWebhookEvent[]) {
  const admin = createAdminClient();
  for (const event of events) {
    const { error } = await admin.rpc("enrich_efi_pix_payment_financials", {
      event_txid: event.txid,
      event_end_to_end_id: event.endToEndId,
      event_amount_cents: event.amountCents,
      event_fee_cents: event.feeCents ?? null,
    });
    if (error) throw new Error("EFI_PIX_FINANCIAL_ENRICHMENT_FAILED");
  }
}

function getSourceIp(headers: Headers): string | null {
  // Vercel overwrites this header at the platform edge, so prefer it over the
  // generic forwarding chain. Keep x-forwarded-for/x-real-ip only as a
  // compatibility fallback for local/test environments.
  const vercelForwarded = headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.split(",")[0]?.trim() || null;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip")?.trim() || null;
}

function safeEqual(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasPixEvents(payload: unknown): payload is { pix: unknown[] } {
  return !!payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).pix);
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
