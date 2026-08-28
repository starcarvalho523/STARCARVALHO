import "server-only";
import { resolveAsaasRuntimeConfig } from "./asaas-config";
import { AsaasPublicError } from "./asaas-provider";

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
  immediateQrCode: Record<string, unknown> | null;
};

type Fetcher = typeof fetch;

function enabled(env: NodeJS.ProcessEnv) {
  return String(env.ASAAS_PIX_AUTOMATIC_ENABLED ?? "").trim().toLowerCase() === "true";
}

export async function createAsaasPixAutomaticAuthorization(
  input: CreatePixAutomaticAuthorizationInput,
  options: { env?: NodeJS.ProcessEnv; fetcher?: Fetcher } = {},
): Promise<PixAutomaticAuthorization> {
  const env = options.env ?? process.env;
  if (!enabled(env)) throw new Error("ASAAS_PIX_AUTOMATIC_DISABLED");
  if (!input.customerId || !input.contractId || !input.startDate) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_INPUT");
  if (!Number.isFinite(input.value) || input.value <= 0) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_VALUE");
  if (input.contractId.length > 35 || input.description.length > 35) throw new Error("ASAAS_PIX_AUTOMATIC_FIELD_TOO_LONG");

  const config = resolveAsaasRuntimeConfig(env);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${config.baseUrl}/pix/automatic/authorizations`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: config.apiKey,
      "user-agent": `StarCarvalhos-${config.providerEnvironment}/1.0`,
    },
    body: JSON.stringify({
      frequency: "MONTHLY",
      contractId: input.contractId,
      startDate: input.startDate,
      value: input.value,
      description: input.description,
      customerId: input.customerId,
      immediateQrCode: {},
      paymentCreationMode: "SUBSCRIPTION",
      retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = firstPublicError(body);
    throw new AsaasPublicError(response.status, detail.code, detail.description);
  }
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).id !== "string") {
    throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_RESPONSE");
  }
  const value = body as Record<string, unknown>;
  const qr = value.immediateQrCode && typeof value.immediateQrCode === "object" && !Array.isArray(value.immediateQrCode)
    ? value.immediateQrCode as Record<string, unknown>
    : null;
  return {
    id: value.id as string,
    status: typeof value.status === "string" ? value.status : null,
    immediateQrCode: qr,
  };
}

function firstPublicError(body: unknown) {
  if (!body || typeof body !== "object") return { code: null, description: null };
  const errors = (body as Record<string, unknown>).errors;
  const first = Array.isArray(errors) && errors[0] && typeof errors[0] === "object"
    ? errors[0] as Record<string, unknown>
    : null;
  const code = typeof first?.code === "string" ? first.code.slice(0, 64) : null;
  const description = typeof first?.description === "string"
    ? first.description.replace(/[\r\n\t]+/g, " ").trim().slice(0, 160)
    : null;
  return { code, description };
}
