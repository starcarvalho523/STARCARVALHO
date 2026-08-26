import "server-only";
import {
  resolveEfiCreditCardConfigForEnvironment,
  type EfiCardProviderEnvironment,
} from "./efi-credit-card-config";

export type EfiCardPayer = { name: string; cpf: string; email: string; phone: string };
export type EfiCardState = "PENDING" | "PAID" | "FAILED" | "REVIEW";
export type EfiCardCharge = { chargeId: string; status: EfiCardState; brand: string | null; last4: string | null };
export type EfiCardNotification = { chargeId: string; customId: string | null; amountCents: number | null; status: EfiCardState };
export type EfiCardErrorStage = "INPUT" | "OAUTH" | "PROVIDER_POST" | "PROVIDER_RESPONSE" | "NOTIFICATION";

export class EfiCardProviderError extends Error {
  constructor(
    readonly publicCode: string,
    readonly httpStatus: number,
    readonly providerCode: string | null,
    readonly stage: EfiCardErrorStage,
    readonly providerPostSent: boolean,
    readonly uncertain: boolean,
  ) {
    super(publicCode);
  }
}

function safeProviderCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const candidate = record.code ?? record.error_code ?? record.error;
  if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return String(candidate);
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return /^[A-Z0-9_]{1,80}$/.test(normalized) ? normalized : null;
}

const deterministicProviderRejections = new Set(["4600222"]);

function providerFailure(status: number, payload: unknown): EfiCardProviderError {
  const providerCode = safeProviderCode(payload);
  const publicCode =
    status === 400 ? "EFI_CARD_PROVIDER_REJECTED_400" :
    status === 401 ? "EFI_CARD_PROVIDER_UNAUTHORIZED_401" :
    status === 403 ? "EFI_CARD_PROVIDER_FORBIDDEN_403" :
    status === 404 ? "EFI_CARD_PROVIDER_NOT_FOUND_404" :
    status === 429 ? "EFI_CARD_PROVIDER_RATE_LIMITED_429" :
    status >= 500 ? "EFI_CARD_PROVIDER_UPSTREAM_5XX" :
    `EFI_CARD_PROVIDER_HTTP_${status}`;
  const uncertain = status >= 500 && !deterministicProviderRejections.has(providerCode ?? "");
  return new EfiCardProviderError(publicCode, status, providerCode, "PROVIDER_POST", true, uncertain);
}

function mapStatus(value: unknown): EfiCardState {
  if (typeof value !== "string") return "REVIEW";
  const status = value.toLowerCase();
  if (["paid", "settled", "approved"].includes(status)) return "PAID";
  if (["unpaid", "waiting", "pending", "new"].includes(status)) return "PENDING";
  if (["canceled", "cancelled", "declined", "failed", "refunded"].includes(status)) return "FAILED";
  return "REVIEW";
}

async function getAccessToken(
  environment: EfiCardProviderEnvironment = "SANDBOX",
): Promise<{ baseUrl: string; token: string }> {
  const config = resolveEfiCreditCardConfigForEnvironment(environment);
  const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v1/authorize`, {
      method: "POST",
      headers: { authorization: `Basic ${authorization}`, "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      cache: "no-store",
    });
  } catch {
    throw new EfiCardProviderError("EFI_CARD_AUTH_NETWORK_FAILED", 0, null, "OAUTH", false, false);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401 ? "EFI_CARD_AUTH_UNAUTHORIZED_401" : `EFI_CARD_AUTH_HTTP_${response.status}`;
    throw new EfiCardProviderError(code, response.status, safeProviderCode(payload), "OAUTH", false, false);
  }
  const token = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).access_token : null;
  if (typeof token !== "string" || !token) {
    throw new EfiCardProviderError("EFI_CARD_AUTH_INVALID_RESPONSE", response.status, null, "OAUTH", false, false);
  }
  return { baseUrl: config.baseUrl, token };
}

export async function createEfiOneStep(input: {
  paymentToken: string;
  amountCents: number;
  payer: EfiCardPayer;
  externalReference: string;
}, environment: EfiCardProviderEnvironment = "SANDBOX"): Promise<EfiCardCharge> {
  if (!input.paymentToken || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new EfiCardProviderError("EFI_CARD_INVALID_CREATE_INPUT", 0, null, "INPUT", false, false);
  }
  const config = resolveEfiCreditCardConfigForEnvironment(environment);
  const auth = await getAccessToken(environment);
  let response: Response;
  try {
    response = await fetch(`${auth.baseUrl}/v1/charge/one-step`, {
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
  } catch {
    throw new EfiCardProviderError("EFI_CARD_PROVIDER_NETWORK_UNCERTAIN", 0, null, "PROVIDER_POST", true, true);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw providerFailure(response.status, payload);
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { data?: { charge_id?: unknown; status?: unknown; payment?: { credit_card?: { brand?: unknown; card_mask?: unknown } } } }).data
    : null;
  if (!data || (typeof data.charge_id !== "number" && typeof data.charge_id !== "string")) {
    throw new EfiCardProviderError("EFI_CARD_PROVIDER_RESPONSE_UNCERTAIN", response.status, null, "PROVIDER_RESPONSE", true, true);
  }
  const mask = data.payment?.credit_card?.card_mask;
  return {
    chargeId: String(data.charge_id),
    status: mapStatus(data.status),
    brand: typeof data.payment?.credit_card?.brand === "string" ? data.payment.credit_card.brand : null,
    last4: typeof mask === "string" && /\d{4}$/.test(mask) ? mask.slice(-4) : null,
  };
}

export async function getEfiCardNotification(
  notificationToken: string,
  environment: EfiCardProviderEnvironment = "SANDBOX",
): Promise<EfiCardNotification> {
  if (!notificationToken || notificationToken.length > 512) throw new Error("EFI_NOTIFICATION_INVALID");
  const auth = await getAccessToken(environment);
  const response = await fetch(`${auth.baseUrl}/v1/notification/${encodeURIComponent(notificationToken)}`, {
    headers: { authorization: `Bearer ${auth.token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new EfiCardProviderError("EFI_NOTIFICATION_LOOKUP_FAILED", response.status, null, "NOTIFICATION", false, false);
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
