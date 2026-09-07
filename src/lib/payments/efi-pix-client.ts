import { resolveEfiPixRuntimeConfig, type EfiPixRuntimeConfig } from "./efi-config.ts";
import { EfiMtlsHttpClient, type EfiHttpTransport } from "./efi-http-client.ts";
import { EfiOAuthClient } from "./efi-oauth-client.ts";

export type EfiImmediatePixCobInput = { amount: number; expiresInSeconds?: number; payerRequest?: string };
export type EfiImmediatePixCob = { txid: string; status: string; locationId: number | null; pixCopyPaste: string | null };
type OAuthPort = Pick<EfiOAuthClient, "getAccessToken">;
type PixDependencies = { oauth?: OAuthPort; transport?: EfiHttpTransport };
const defaultPayerRequest = "Pagamento estacionamento Star Carvalhos";
export const EFI_CASUAL_PIX_TTL_SECONDS = 5 * 60;

export class EfiPixClient {
  private readonly oauth: OAuthPort;
  private readonly transport: EfiHttpTransport;
  constructor(private readonly config: EfiPixRuntimeConfig, dependencies: PixDependencies = {}) {
    this.oauth = dependencies.oauth ?? new EfiOAuthClient(config);
    this.transport = dependencies.transport ?? new EfiMtlsHttpClient(config);
  }

  async createImmediateCob(input: EfiImmediatePixCobInput): Promise<EfiImmediatePixCob> {
    try {
      const formattedAmount = formatAmount(input.amount);
      const access = await this.oauth.getAccessToken();
      const response = await this.transport.request({
        path: "/v2/cob",
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${access.accessToken}` },
        body: JSON.stringify({ calendario: { expiracao: input.expiresInSeconds ?? EFI_CASUAL_PIX_TTL_SECONDS }, valor: { original: formattedAmount }, chave: this.config.pixKey, solicitacaoPagador: input.payerRequest ?? defaultPayerRequest }),
      });
      if (response.status < 200 || response.status >= 300) throw new Error("EFI_PIX_CREATE_FAILED");
      return parseCobResponse(response.body);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "EFI_AUTH_FAILED" || code === "EFI_CERTIFICATE_INVALID" || code === "EFI_TIMEOUT" || code === "EFI_INVALID_RESPONSE") throw error;
      throw new Error("EFI_PIX_CREATE_FAILED");
    }
  }

  async cancelImmediateCob(txid: string): Promise<void> {
    if (!/^[A-Za-z0-9]{26,35}$/.test(txid)) throw new Error("EFI_PIX_CANCEL_FAILED");
    try {
      const access = await this.oauth.getAccessToken();
      const response = await this.transport.request({
        path: `/v2/cob/${encodeURIComponent(txid)}`,
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${access.accessToken}` },
        body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }),
      });
      if ((response.status < 200 || response.status >= 300) && ![400, 404, 409].includes(response.status)) throw new Error("EFI_PIX_CANCEL_FAILED");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "EFI_AUTH_FAILED" || code === "EFI_CERTIFICATE_INVALID" || code === "EFI_TIMEOUT") throw error;
      throw new Error("EFI_PIX_CANCEL_FAILED");
    }
  }
}

export function createImmediateEfiPixCob(input: EfiImmediatePixCobInput, options: { env?: NodeJS.ProcessEnv; dependencies?: PixDependencies } = {}) {
  const config = resolveEfiPixRuntimeConfig(options.env);
  return new EfiPixClient(config, options.dependencies).createImmediateCob(input);
}

export function cancelImmediateEfiPixCob(txid: string, options: { env?: NodeJS.ProcessEnv; dependencies?: PixDependencies } = {}) {
  const config = resolveEfiPixRuntimeConfig(options.env);
  return new EfiPixClient(config, options.dependencies).cancelImmediateCob(txid);
}

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("EFI_PIX_CREATE_FAILED");
  const decimal = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(amount));
  if (!decimal) throw new Error("EFI_PIX_CREATE_FAILED");
  const wholeReais = BigInt(decimal[1]);
  const cents = BigInt((decimal[2] ?? "").padEnd(2, "0"));
  const totalCents = wholeReais * BigInt(100) + cents;
  if (totalCents <= BigInt(0)) throw new Error("EFI_PIX_CREATE_FAILED");
  return `${wholeReais}.${cents.toString().padStart(2, "0")}`;
}

function parseCobResponse(body: string): EfiImmediatePixCob {
  let parsed: unknown; try { parsed = JSON.parse(body); } catch { throw new Error("EFI_INVALID_RESPONSE"); }
  if (!parsed || typeof parsed !== "object") throw new Error("EFI_INVALID_RESPONSE");
  const value = parsed as Record<string, unknown>; const loc = value.loc;
  if (typeof value.txid !== "string" || !value.txid || typeof value.status !== "string") throw new Error("EFI_INVALID_RESPONSE");
  const locationId = loc && typeof loc === "object" && typeof (loc as Record<string, unknown>).id === "number" ? (loc as Record<string, number>).id : null;
  return { txid: value.txid, status: value.status, locationId, pixCopyPaste: typeof value.pixCopiaECola === "string" ? value.pixCopiaECola : null };
}
