import "server-only";
import { resolveEfiCreditCardConfig } from "./efi-credit-card-config";

export type EfiCardPayer = { name: string; cpf: string; email: string; phone: string };
export type EfiCardState = "PENDING" | "PAID" | "FAILED" | "REVIEW";
export type EfiCardCharge = { chargeId: string; status: EfiCardState; brand: string | null; last4: string | null };
export type EfiCardNotification = { chargeId: string; customId: string | null; amountCents: number | null; status: EfiCardState };

export class EfiCardProviderError extends Error {
  constructor(
    readonly publicCode: string,
    readonly httpStatus: number,
    readonly providerCode: string | null,
  ) {
    super(publicCode);
  }
}

function safeProviderCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const candidate = record.code ?? record.error_code ?? record.error;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return /^[A-Z0-9_]{1,80}$/.test(normalized) ? normalized : null;
}

function providerFailure(status: number, payload: unknown): EfiCardProviderError {
  const publicCode =
    status === 400 ? "EFI_CARD_PROVIDER_REJECTED_400" :
    status === 401 ? "EFI_CARD_PROVIDER_UNAUTHORIZED_401" :
    status === 403 ? "EFI_CARD_PROVIDER_FORBIDDEN_403" :
    status === 404 ? "EFI_CARD_PROVIDER_NOT_FOUND_404" :
    status === 429 ? "EFI_CARD_PROVIDER_RATE_LIMITED_429" :
    status >= 500 ? "EFI_CARD_PROVIDER_UPSTREAM_5XX" :
    `EFI_CARD_PROVIDER_HTTP_${status}`;
  return new EfiCardProviderError(publicCode, status, safeProviderCode(payload));
}

function mapStatus(value: unknown): EfiCardState {
  if (typeof value !== "string") return "REVIEW";
  const status = value.toLowerCase();
  if (["paid", "settled", "approved"].includes(status)) return "PAID";
  if (["unpaid", "waiting", "pending", "new"].includes(status)) return "PENDING";
  if (["canceled", "cancelled", "declined", "failed", "refunded"].includes(status)) return "FAILED";
  return "REVIEW";
}

async function getAccessToken(): Promise<{ baseUrl: string; token: string }> {
  const config = resolveEfiCreditCardConfig();
  const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/v1/authorize`, {
    method: "POST",
    headers: { authorization: `Basic ${authorization}`, "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("EFI_AUTH_FAILED");
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("EFI_AUTH_FAILED");
  return { baseUrl: config.baseUrl, token: payload.access_token };
}

export async function createEfiOneStep(input: {
  paymentToken: string;
  amountCents: number;
  payer: EfiCardPayer;
  externalReference: string;
}): Promise<EfiCardCharge> {
  if (!input.paymentToken || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("EFI_CREDIT_CREATE_FAILED");
  const config = resolveEfiCreditCardConfig();
  const auth = await getAccessToken();
  const response = await fetch(`${auth.baseUrl}/v1/charge/one-step`, {
    method: "POST",
    headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      items: [{ name: "Estadia Star Carvalhos", value: input.amountCents, amount: 1 }],
      metadata: { custom_id: input.externalReference, notification_url: config.notificationUrl },
      payment: {
        credit_card: {
          customer: { name: input.payer.name, cpf: input.payer.cpf, email: input.payer.email, phone_number: input.payer.phone },
          installments: 1,
          payment_token: input.paymentToken,
        },
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw providerFailure(response.status, payload);
  }
  const body = (await response.json()) as { data?: { charge_id?: unknown; status?: unknown; payment?: { credit_card?: { brand?: unknown; card_mask?: unknown } } } };
  const data = body.data;
  if (!data || typeof data.charge_id !== "number") throw new Error("EFI_INVALID_RESPONSE");
  const mask = data.payment?.credit_card?.card_mask;
  return {
    chargeId: String(data.charge_id),
    status: mapStatus(data.status),
    brand: typeof data.payment?.credit_card?.brand === "string" ? data.payment.credit_card.brand : null,
    last4: typeof mask === "string" && /\d{4}$/.test(mask) ? mask.slice(-4) : null,
  };
}

export async function getEfiCardNotification(notificationToken: string): Promise<EfiCardNotification> {
  if (!notificationToken || notificationToken.length > 512) throw new Error("EFI_NOTIFICATION_INVALID");
  const auth = await getAccessToken();
  const response = await fetch(`${auth.baseUrl}/v1/notification/${encodeURIComponent(notificationToken)}`, {
    headers: { authorization: `Bearer ${auth.token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("EFI_NOTIFICATION_LOOKUP_FAILED");
  const payload = (await response.json()) as { data?: unknown };
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const row = [...rows].reverse().find((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (!row) throw new Error("EFI_INVALID_RESPONSE");
  const identifiers = row.identifiers && typeof row.identifiers === "object" ? (row.identifiers as Record<string, unknown>) : {};
  const statusObject = row.status && typeof row.status === "object" ? (row.status as Record<string, unknown>) : {};
  const rawChargeId = identifiers.charge_id ?? row.charge_id;
  const rawValue = row.value;
  const amountCents = typeof rawValue === "number" && Number.isSafeInteger(rawValue) && rawValue >= 0 ? rawValue : null;
  if ((typeof rawChargeId !== "number" && typeof rawChargeId !== "string") || String(rawChargeId).length === 0) throw new Error("EFI_INVALID_RESPONSE");
  return {
    chargeId: String(rawChargeId),
    customId: typeof row.custom_id === "string" ? row.custom_id : null,
    amountCents,
    status: mapStatus(statusObject.current ?? row.status),
  };
}
