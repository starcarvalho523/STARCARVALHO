import { resolveEfiPixRuntimeConfig, type EfiPixRuntimeConfig } from "./efi-config.ts";
import { EfiMtlsHttpClient, type EfiHttpTransport } from "./efi-http-client.ts";
import { EfiOAuthClient, type EfiAccessToken } from "./efi-oauth-client.ts";

export type EfiImmediatePixCobInput = { amount: number; expiresInSeconds?: number; payerRequest?: string };
export type EfiImmediatePixCob = { txid: string; status: string; locationId: number | null; pixCopyPaste: string | null };
type OAuthPort = Pick<EfiOAuthClient, "getAccessToken">;
type PixDependencies = { oauth?: OAuthPort; transport?: EfiHttpTransport };
const defaultPayerRequest = "Pagamento estacionamento Star Carvalhos";

/** Sandbox-only Pix Cob client. It is not wired to any parking payment flow. */
export class EfiPixClient {
  private readonly oauth: OAuthPort;
  private readonly transport: EfiHttpTransport;
  constructor(private readonly config: EfiPixRuntimeConfig, dependencies: PixDependencies = {}) {
    this.oauth = dependencies.oauth ?? new EfiOAuthClient(config);
    this.transport = dependencies.transport ?? new EfiMtlsHttpClient(config);
  }

  async createImmediateCob(input: EfiImmediatePixCobInput): Promise<EfiImmediatePixCob> {
    try {
      const access = await this.oauth.getAccessToken();
      const response = await this.transport.request({
        path: "/v2/cob",
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${access.accessToken}` },
        body: JSON.stringify({ calendario: { expiracao: input.expiresInSeconds ?? 3600 }, valor: { original: formatAmount(input.amount) }, chave: this.config.pixKey, solicitacaoPagador: input.payerRequest ?? defaultPayerRequest }),
      });
      if (response.status < 200 || response.status >= 300) throw new Error("EFI_PIX_CREATE_FAILED");
      return parseCobResponse(response.body);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "EFI_AUTH_FAILED" || code === "EFI_CERTIFICATE_INVALID" || code === "EFI_TIMEOUT" || code === "EFI_INVALID_RESPONSE") throw error;
      throw new Error("EFI_PIX_CREATE_FAILED");
    }
  }
}

export function createImmediateEfiPixCob(input: EfiImmediatePixCobInput, options: { env?: NodeJS.ProcessEnv; dependencies?: PixDependencies } = {}) {
  const config = resolveEfiPixRuntimeConfig(options.env);
  return new EfiPixClient(config, options.dependencies).createImmediateCob(input);
}

function formatAmount(amount: number): string { if (!Number.isFinite(amount) || amount <= 0) throw new Error("EFI_PIX_CREATE_FAILED"); return amount.toFixed(2); }
function parseCobResponse(body: string): EfiImmediatePixCob {
  let parsed: unknown; try { parsed = JSON.parse(body); } catch { throw new Error("EFI_INVALID_RESPONSE"); }
  if (!parsed || typeof parsed !== "object") throw new Error("EFI_INVALID_RESPONSE");
  const value = parsed as Record<string, unknown>; const loc = value.loc;
  if (typeof value.txid !== "string" || !value.txid || typeof value.status !== "string") throw new Error("EFI_INVALID_RESPONSE");
  const locationId = loc && typeof loc === "object" && typeof (loc as Record<string, unknown>).id === "number" ? (loc as Record<string, number>).id : null;
  return { txid: value.txid, status: value.status, locationId, pixCopyPaste: typeof value.pixCopiaECola === "string" ? value.pixCopiaECola : null };
}
