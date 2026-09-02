import "server-only";
import { resolveAsaasRuntimeConfig } from "./asaas-config";
import { AsaasPublicError } from "./asaas-provider";
import {
  buildPixAutomaticAuthorizationBody,
  buildPixAutomaticChargeBody,
  isAsaasPixAutomaticEnabled,
  normalizePixAutomaticAuthorization,
  normalizePixAutomaticCharge,
  type CreatePixAutomaticAuthorizationInput,
  type CreatePixAutomaticChargeInput,
  type PixAutomaticAuthorization,
  type PixAutomaticCharge,
} from "./asaas-pix-automatic-core";

export type {
  CreatePixAutomaticAuthorizationInput,
  CreatePixAutomaticChargeInput,
  PixAutomaticAuthorization,
  PixAutomaticCharge,
} from "./asaas-pix-automatic-core";
export { isAsaasPixAutomaticEnabled } from "./asaas-pix-automatic-core";

type Fetcher = typeof fetch;

export async function createAsaasPixAutomaticAuthorization(
  input: CreatePixAutomaticAuthorizationInput,
  options: { env?: NodeJS.ProcessEnv; fetcher?: Fetcher } = {},
): Promise<PixAutomaticAuthorization> {
  const env = options.env ?? process.env;
  if (!isAsaasPixAutomaticEnabled(env)) throw new Error("ASAAS_PIX_AUTOMATIC_DISABLED");

  const config = resolveAsaasRuntimeConfig(env);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${config.baseUrl}/pix/automatic/authorizations`, {
    method: "POST",
    headers: providerHeaders(config.apiKey, config.providerEnvironment),
    body: JSON.stringify(buildPixAutomaticAuthorizationBody(input)),
    cache: "no-store",
  });

  return normalizePixAutomaticAuthorization(await parseResponse(response));
}

export async function createAsaasPixAutomaticCharge(
  input: CreatePixAutomaticChargeInput,
  options: { env?: NodeJS.ProcessEnv; fetcher?: Fetcher } = {},
): Promise<PixAutomaticCharge> {
  const env = options.env ?? process.env;
  if (!isAsaasPixAutomaticEnabled(env)) throw new Error("ASAAS_PIX_AUTOMATIC_DISABLED");

  const config = resolveAsaasRuntimeConfig(env);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${config.baseUrl}/payments`, {
    method: "POST",
    headers: providerHeaders(config.apiKey, config.providerEnvironment),
    body: JSON.stringify(buildPixAutomaticChargeBody(input)),
    cache: "no-store",
  });

  return normalizePixAutomaticCharge(await parseResponse(response), input.amount);
}

function providerHeaders(apiKey: string, environment: "SANDBOX" | "PRODUCTION") {
  return {
    accept: "application/json",
    "content-type": "application/json",
    access_token: apiKey,
    "user-agent": `StarCarvalhos-${environment}/1.0`,
  };
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = firstPublicError(body);
    throw new AsaasPublicError(response.status, detail.code, detail.description);
  }
  return body;
}

function firstPublicError(body: unknown) {
  if (!isRecord(body)) return { code: null, description: null };
  const errors = body.errors;
  const first = Array.isArray(errors) && isRecord(errors[0]) ? errors[0] : null;
  const code = typeof first?.code === "string" ? first.code.slice(0, 64) : null;
  const description = typeof first?.description === "string"
    ? first.description.replace(/[\r\n\t]+/g, " ").trim().slice(0, 160)
    : null;
  return { code, description };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
