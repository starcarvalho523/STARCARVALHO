export type CreatePixAutomaticAuthorizationInput = {
  customerId: string;
  contractId: string;
  value: number;
  startDate: string;
  description: string;
};

export type PixAutomaticAuthorization = {
  id: string;
  status: string | null;
  qrCodePayload: string | null;
  qrCodeImageBase64: string | null;
  expiresAt: string | null;
  conciliationIdentifier: string | null;
};

export type CreatePixAutomaticChargeInput = {
  customerId: string;
  authorizationId: string;
  amount: number;
  dueDate: string;
  description: string;
  externalReference: string;
};

export type PixAutomaticCharge = {
  id: string;
  status: string;
  customerId: string;
  amount: number;
  externalReference: string | null;
};

export function isAsaasPixAutomaticEnabled(env: NodeJS.ProcessEnv = process.env) {
  const explicit = String(env.ASAAS_PIX_AUTOMATIC_ENABLED ?? "").trim().toLowerCase() === "true";
  if (explicit) return true;

  const isPreview = String(env.VERCEL_ENV ?? "").trim().toLowerCase() === "preview";
  const isSandbox = String(env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase() === "sandbox";
  return isPreview && isSandbox;
}

export function validatePixAutomaticAuthorizationInput(input: CreatePixAutomaticAuthorizationInput) {
  if (!input.customerId || !input.contractId || !input.startDate) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_INPUT");
  if (!Number.isFinite(input.value) || input.value <= 0) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_VALUE");
  if (input.contractId.length > 35 || input.description.length > 35) throw new Error("ASAAS_PIX_AUTOMATIC_FIELD_TOO_LONG");
}

export function buildPixAutomaticAuthorizationBody(input: CreatePixAutomaticAuthorizationInput) {
  validatePixAutomaticAuthorizationInput(input);
  return {
    frequency: "MONTHLY",
    contractId: input.contractId,
    startDate: input.startDate,
    value: input.value,
    description: input.description,
    customerId: input.customerId,
    immediateQrCode: {},
    paymentCreationMode: "MANUAL",
    retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
  } as const;
}

export function normalizePixAutomaticAuthorization(body: unknown): PixAutomaticAuthorization {
  if (!isRecord(body) || typeof body.id !== "string") throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_RESPONSE");
  const qr = isRecord(body.immediateQrCode) ? body.immediateQrCode : null;
  return {
    id: body.id,
    status: stringOrNull(body.status),
    qrCodePayload: stringOrNull(qr?.payload),
    qrCodeImageBase64: stringOrNull(qr?.encodedImage),
    expiresAt: stringOrNull(qr?.expirationDate),
    conciliationIdentifier: stringOrNull(qr?.conciliationIdentifier),
  };
}

export function validatePixAutomaticChargeInput(input: CreatePixAutomaticChargeInput) {
  if (!input.customerId || !input.authorizationId || !input.dueDate || !input.externalReference) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_INPUT");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_VALUE");
}

export function buildPixAutomaticChargeBody(input: CreatePixAutomaticChargeInput) {
  validatePixAutomaticChargeInput(input);
  return {
    customer: input.customerId,
    billingType: "PIX",
    value: input.amount,
    dueDate: input.dueDate,
    description: input.description,
    externalReference: input.externalReference,
    pixAutomaticAuthorizationId: input.authorizationId,
  } as const;
}

export function normalizePixAutomaticCharge(body: unknown, expectedAmount: number): PixAutomaticCharge {
  if (!isRecord(body) || typeof body.id !== "string" || typeof body.status !== "string" || typeof body.customer !== "string") {
    throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_CHARGE_RESPONSE");
  }
  const amount = numberOrNull(body.value);
  if (amount === null || Math.abs(amount - expectedAmount) > 0.0001) throw new Error("ASAAS_PIX_AUTOMATIC_CHARGE_AMOUNT_MISMATCH");
  return {
    id: body.id,
    status: body.status,
    customerId: body.customer,
    amount,
    externalReference: stringOrNull(body.externalReference),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
function numberOrNull(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}
