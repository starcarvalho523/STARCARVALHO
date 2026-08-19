import { isAsaasConfigured, resolveAsaasRuntimeConfig } from "@/lib/payments/asaas-config";

export const dynamic = "force-dynamic";

export async function GET() {
  let failure: string | null = null;
  try {
    resolveAsaasRuntimeConfig();
  } catch (error) {
    failure = error instanceof Error ? error.message : "UNKNOWN_ASAAS_CONFIGURATION_ERROR";
  }

  const rawBaseUrl = (process.env.ASAAS_BASE_URL ?? "").replace(/\/$/, "");
  const environment = process.env.ASAAS_ENVIRONMENT ?? "MISSING";
  const expectedBaseUrl = environment === "production"
    ? "https://api.asaas.com/v3"
    : environment === "sandbox"
      ? "https://api-sandbox.asaas.com/v3"
      : null;

  console.info("[payment-readiness-probe]", JSON.stringify({
    vercelEnv: process.env.VERCEL_ENV ?? "MISSING",
    environment,
    liveFlagExact: process.env.ASAAS_LIVE_PAYMENTS_ENABLED === "true",
    baseUrlPresent: Boolean(process.env.ASAAS_BASE_URL),
    baseUrlMatchesEnvironment: expectedBaseUrl !== null && rawBaseUrl === expectedBaseUrl,
    apiKeyPresent: Boolean(process.env.ASAAS_API_KEY),
    webhookTokenPresent: Boolean(process.env.ASAAS_WEBHOOK_TOKEN),
    chargeReady: isAsaasConfigured(),
    failure,
  }));

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
