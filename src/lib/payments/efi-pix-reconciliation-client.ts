import { amountToCents, assertEfiTxid, mapEfiStatus, parseEfiAmountToCents } from "./efi-contracts.ts";
import { resolveEfiRuntimeConfig, type EfiAuthRuntimeConfig } from "./efi-config.ts";
import { EfiMtlsHttpClient, type EfiHttpTransport } from "./efi-http-client.ts";
import { EfiOAuthClient } from "./efi-oauth-client.ts";
import type { ProviderPaymentState } from "./payment-provider.ts";

export type EfiPixCobSnapshot={txid:string;status:string;paymentState:ProviderPaymentState;originalAmount:number;paidAmount:number|null;paidAt:string|null;endToEndId:string|null};
export type EfiPixCobReconciliationInput={txid:string;expectedAmount:number};
type OAuthPort=Pick<EfiOAuthClient,"getAccessToken">;
type Dependencies={oauth?:OAuthPort;transport?:EfiHttpTransport};
const safeProviderCodes=new Set(["cob_nao_encontrada"]);

/** Sandbox-only read/reconciliation foundation. It never writes payments or parking sessions. */
export class EfiPixReconciliationClient{
 private readonly oauth:OAuthPort;private readonly transport:EfiHttpTransport;
 constructor(private readonly config:EfiAuthRuntimeConfig,dependencies:Dependencies={}){this.oauth=dependencies.oauth??new EfiOAuthClient(config);this.transport=dependencies.transport??new EfiMtlsHttpClient(config)}
 async getCob(input:EfiPixCobReconciliationInput):Promise<EfiPixCobSnapshot>{
  const txid=assertEfiTxid(input.txid);const expectedAmountCents=amountToCents(input.expectedAmount);
  try{const access=await this.oauth.getAccessToken();const response=await this.transport.request({path:`/v2/cob/${txid}`,method:"GET",headers:{authorization:`Bearer ${access.accessToken}`},body:""});if(response.status<200||response.status>=300)throw httpError(response.status,response.body);const snapshot=parseSnapshot(response.body);if(snapshot.paymentState==="PAID"&&snapshot.paidAmount!==null&&amountToCents(snapshot.paidAmount)!==expectedAmountCents)throw new Error("EFI_AMOUNT_MISMATCH");return snapshot}
  catch(error){const code=error instanceof Error?error.message:"";if(code==="EFI_TXID_INVALID"||code==="EFI_AMOUNT_MISMATCH"||code==="EFI_AUTH_FAILED"||code==="EFI_CERTIFICATE_INVALID"||code==="EFI_TIMEOUT"||code==="EFI_INVALID_RESPONSE"||code==="EFI_UNKNOWN_STATUS"||code.startsWith("EFI_RECONCILIATION_FAILED:"))throw error;throw new Error("EFI_RECONCILIATION_FAILED")}
 }
}
export function getEfiPixCobSnapshot(input:EfiPixCobReconciliationInput,options:{env?:NodeJS.ProcessEnv;dependencies?:Dependencies}={}){return new EfiPixReconciliationClient(resolveEfiRuntimeConfig(options.env),options.dependencies).getCob(input)}
function httpError(status:number,body:string){let code="provider_error";try{const parsed=JSON.parse(body) as {nome?:unknown};if(typeof parsed?.nome==="string"&&safeProviderCodes.has(parsed.nome))code=parsed.nome}catch{}return new Error(`EFI_RECONCILIATION_FAILED:${status}:${code}`)}
function parseSnapshot(body:string):EfiPixCobSnapshot{let parsed:unknown;try{parsed=JSON.parse(body)}catch{throw new Error("EFI_INVALID_RESPONSE")}if(!parsed||typeof parsed!=="object")throw new Error("EFI_INVALID_RESPONSE");const cob=parsed as Record<string,unknown>;if(typeof cob.txid!=="string")throw new Error("EFI_INVALID_RESPONSE");const txid=assertEfiTxid(cob.txid);if(typeof cob.status!=="string")throw new Error("EFI_INVALID_RESPONSE");const paymentState=mapEfiStatus(cob.status);const valor=cob.valor;if(!valor||typeof valor!=="object")throw new Error("EFI_INVALID_RESPONSE");const originalCents=parseEfiAmountToCents((valor as Record<string,unknown>).original);const pix=Array.isArray(cob.pix)?cob.pix:[];if(!pix.length)return{txid,status:cob.status,paymentState,originalAmount:originalCents/100,paidAmount:null,paidAt:null,endToEndId:null};const first=pix[0];if(!first||typeof first!=="object")throw new Error("EFI_INVALID_RESPONSE");const received=first as Record<string,unknown>;if(typeof received.endToEndId!=="string"||!received.endToEndId||typeof received.horario!=="string"||!Number.isFinite(Date.parse(received.horario)))throw new Error("EFI_INVALID_RESPONSE");const paidCents=parseEfiAmountToCents(received.valor);return{txid,status:cob.status,paymentState,originalAmount:originalCents/100,paidAmount:paidCents/100,paidAt:received.horario,endToEndId:received.endToEndId}}
