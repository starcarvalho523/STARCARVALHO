import { resolveEfiPixRuntimeConfig, type EfiPixRuntimeConfig } from "./efi-config.ts";
import { EfiMtlsHttpClient, type EfiHttpTransport } from "./efi-http-client.ts";
import { EfiOAuthClient } from "./efi-oauth-client.ts";

type OAuthPort = Pick<EfiOAuthClient, "getAccessToken">;
type Dependencies = { oauth?: OAuthPort; transport?: EfiHttpTransport };

export class EfiPixWebhookRegistrationError extends Error {
  constructor(
    public readonly providerStatus: number,
    public readonly providerMessage: string | null,
  ) {
    super("EFI_PIX_WEBHOOK_CONFIG_FAILED");
    this.name = "EfiPixWebhookRegistrationError";
  }
}

export class EfiPixWebhookClient {
  private readonly oauth: OAuthPort;
  private readonly transport: EfiHttpTransport;

  constructor(private readonly config: EfiPixRuntimeConfig, dependencies: Dependencies = {}) {
    this.oauth = dependencies.oauth ?? new EfiOAuthClient(config);
    this.transport = dependencies.transport ?? new EfiMtlsHttpClient(config);
  }

  async configureServerlessWebhook(webhookUrl: string): Promise<void> {
    assertWebhookUrl(webhookUrl);
    const access = await this.oauth.getAccessToken();
    const response = await this.transport.request({
      path: `/v2/webhook/${encodeURIComponent(this.config.pixKey)}`,
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${access.accessToken}`,
        "x-skip-mtls-checking": "true",
      },
      body: JSON.stringify({ webhookUrl }),
    });
    if (response.status !== 201) {
      throw new EfiPixWebhookRegistrationError(response.status, extractSafeProviderMessage(response.body));
    }
  }
}

export function buildEfiPixServerlessWebhookUrl(env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const secret = env.EFI_PIX_WEBHOOK_HMAC_SECRET ?? "";
  if (!/^https:\/\//i.test(baseUrl) || !secret) throw new Error("EFI_PIX_WEBHOOK_NOT_CONFIGURED");
  const url = new URL(`${baseUrl}/api/webhooks/efi-pix`);
  url.searchParams.set("hmac", secret);
  url.searchParams.set("ignorar", "");
  return url.toString();
}

export async function configureEfiPixServerlessWebhook(env: NodeJS.ProcessEnv = process.env, dependencies: Dependencies = {}) {
  const config = resolveEfiPixRuntimeConfig(env);
  if (config.providerEnvironment !== "PRODUCTION") throw new Error("EFI_PIX_WEBHOOK_PRODUCTION_ONLY");
  const webhookUrl = buildEfiPixServerlessWebhookUrl(env);
  await new EfiPixWebhookClient(config, dependencies).configureServerlessWebhook(webhookUrl);
}

function assertWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("EFI_PIX_WEBHOOK_INVALID_URL"); }
  if (url.protocol !== "https:" || !url.searchParams.get("hmac")) throw new Error("EFI_PIX_WEBHOOK_INVALID_URL");
}

function extractSafeProviderMessage(body: string): string | null {
  if (!body.trim()) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const candidates = [parsed.mensagem, parsed.message, parsed.detail, parsed.title, parsed.nome];
    const direct = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (direct) return sanitizeProviderMessage(direct);

    if (Array.isArray(parsed.violacoes)) {
      const reasons = parsed.violacoes
        .map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).razao : null)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .slice(0, 3)
        .map(sanitizeProviderMessage);
      if (reasons.length > 0) return reasons.join(" | ");
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeProviderMessage(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .trim()
    .slice(0, 300);
}
