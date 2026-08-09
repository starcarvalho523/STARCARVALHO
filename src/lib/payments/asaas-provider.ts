import { timingSafeEqual } from "node:crypto";
import type { CreateChargeInput, PaymentProvider, ProviderCharge, ProviderPaymentState, ProviderWebhookEvent } from "./payment-provider";

type Fetcher = typeof fetch;
type AsaasPayment = { id?:unknown; customer?:unknown; status?:unknown; value?:unknown; externalReference?:unknown; invoiceUrl?:unknown };
type AsaasQrCode = { payload?:unknown; encodedImage?:unknown; expirationDate?:unknown };

export type AsaasProviderConfig = { apiKey:string; baseUrl:string; environment:"sandbox"; fetcher?:Fetcher };

export class AsaasProvider implements PaymentProvider {
  readonly name = "ASAAS" as const;
  readonly environment = "SANDBOX" as const;
  private readonly fetcher: Fetcher;
  private readonly baseUrl: string;

  constructor(private readonly config:AsaasProviderConfig) {
    if(config.environment!=="sandbox" || config.baseUrl.replace(/\/$/,"")!=="https://api-sandbox.asaas.com/v3") throw new Error("ASAAS_SANDBOX_ONLY");
    if(!config.apiKey) throw new Error("ASAAS_API_KEY_NOT_CONFIGURED");
    this.baseUrl=config.baseUrl.replace(/\/$/,"");
    this.fetcher=config.fetcher??fetch;
  }

  async createPixCharge(input:CreateChargeInput):Promise<ProviderCharge>{
    const payment=await this.createCharge("PIX",input);
    const qr=await this.request<AsaasQrCode>(`/payments/${encodeURIComponent(payment.providerPaymentId)}/pixQrCode`);
    return {...payment,qrCodePayload:stringOrNull(qr.payload),qrCodeImageBase64:stringOrNull(qr.encodedImage),expiresAt:stringOrNull(qr.expirationDate)};
  }

  async createCreditCardPayment(input:CreateChargeInput):Promise<ProviderCharge>{
    return this.createCharge("CREDIT_CARD",input);
  }

  async getPayment(providerPaymentId:string):Promise<ProviderCharge>{
    return normalizePayment(await this.request<AsaasPayment>(`/payments/${encodeURIComponent(providerPaymentId)}`));
  }

  async cancelPayment(providerPaymentId:string):Promise<void>{
    await this.request(`/payments/${encodeURIComponent(providerPaymentId)}`,{method:"DELETE"});
  }

  getHostedPaymentUrl(payment:ProviderCharge){return payment.hostedPaymentUrl}

  validateWebhook(receivedToken:string|null,expectedToken:string){
    if(!receivedToken||!expectedToken)return false;
    const received=Buffer.from(receivedToken);const expected=Buffer.from(expectedToken);
    return received.length===expected.length&&timingSafeEqual(received,expected);
  }

  parseWebhook(payload:unknown):ProviderWebhookEvent{
    if(!isRecord(payload)||typeof payload.id!=="string"||typeof payload.event!=="string"||!isRecord(payload.payment)||typeof payload.payment.id!=="string") throw new Error("INVALID_ASAAS_WEBHOOK");
    const id=payload.id;const type=payload.event;const payment=payload.payment;const paymentId=payment.id as string;
    return{id,type,paymentId,paymentStatus:typeof payment.status==="string"?payment.status:"UNKNOWN",amount:numberOrNull(payment.value),externalReference:stringOrNull(payment.externalReference),billingType:stringOrNull(payment.billingType)};
  }

  private async createCharge(billingType:"PIX"|"CREDIT_CARD",input:CreateChargeInput){
    const body={customer:input.customerId,billingType,value:input.amount,dueDate:input.dueDate,description:input.description,externalReference:input.externalReference};
    return normalizePayment(await this.request<AsaasPayment>("/payments",{method:"POST",body:JSON.stringify(body)}));
  }

  private async request<T=unknown>(path:string,init:RequestInit={}):Promise<T>{
    const response=await this.fetcher(`${this.baseUrl}${path}`,{...init,headers:{accept:"application/json","content-type":"application/json",access_token:this.config.apiKey,"user-agent":"StarCarvalhos-Sandbox/1.0",...init.headers},cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(`ASAAS_HTTP_${response.status}`);
    return body as T;
  }
}

export function mapAsaasPaymentState(status:string,eventType?:string):ProviderPaymentState{
  if(eventType==="PAYMENT_RECEIVED"||status==="RECEIVED")return "PAID";
  if(eventType==="PAYMENT_OVERDUE"||status==="OVERDUE")return "EXPIRED";
  if(eventType==="PAYMENT_DELETED"||status==="DELETED")return "CANCELLED";
  if(status==="REFUNDED"||status==="CHARGEBACK_REQUESTED"||status==="CHARGEBACK_DISPUTE")return "REVIEW";
  return "PENDING";
}

function normalizePayment(value:AsaasPayment):ProviderCharge{
  if(typeof value.id!=="string"||typeof value.customer!=="string"||typeof value.status!=="string")throw new Error("INVALID_ASAAS_PAYMENT");
  return{providerPaymentId:value.id,providerCustomerId:value.customer,providerStatus:value.status,amount:numberOrNull(value.value)??0,externalReference:stringOrNull(value.externalReference)??"",hostedPaymentUrl:stringOrNull(value.invoiceUrl),qrCodePayload:null,qrCodeImageBase64:null,expiresAt:null};
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
function stringOrNull(value:unknown){return typeof value==="string"?value:null}
function numberOrNull(value:unknown){const number=typeof value==="number"?value:typeof value==="string"?Number(value):NaN;return Number.isFinite(number)?number:null}
