import { resolveEfiPixRuntimeConfig, type EfiPixRuntimeConfig } from "./efi-config.ts";
import { EfiMtlsHttpClient, type EfiHttpTransport } from "./efi-http-client.ts";
import { EfiOAuthClient } from "./efi-oauth-client.ts";

type OAuthPort = Pick<EfiOAuthClient, "getAccessToken">;
type Dependencies = { oauth?: OAuthPort; transport?: EfiHttpTransport };

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
    if (response.status !== 201) throw new Error("EFI_PIX_WEBHOOK_CONFIG_FAILED");
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
