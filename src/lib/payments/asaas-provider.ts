import { timingSafeEqual } from "node:crypto";
import type { CreateChargeInput, PaymentProvider, ProviderCharge, ProviderPaymentState, ProviderPixQrCode, ProviderWebhookEvent } from "./payment-provider";

type Fetcher = typeof fetch;
type AsaasPayment = { id?:unknown; customer?:unknown; status?:unknown; billingType?:unknown; value?:unknown; externalReference?:unknown; invoiceUrl?:unknown };
type AsaasQrCode = { payload?:unknown; encodedImage?:unknown; expirationDate?:unknown };
type AsaasList = { data?:unknown };
type AsaasErrorBody = { errors?:unknown };

export class AsaasPublicError extends Error {
  constructor(readonly status:number,readonly publicCode:string|null,readonly publicDescription:string|null){
    super(`ASAAS_HTTP_${status}${publicCode?`_${publicCode}`:""}`);
    this.name="AsaasPublicError";
  }
}

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

  async createPixPayment(input:CreateChargeInput):Promise<ProviderCharge>{
    return this.createCharge("PIX",input);
  }

  async getPixQrCode(providerPaymentId:string):Promise<ProviderPixQrCode>{
    const qr=await this.request<AsaasQrCode>(`/payments/${encodeURIComponent(providerPaymentId)}/pixQrCode`);
    const result={qrCodePayload:stringOrNull(qr.payload),qrCodeImageBase64:stringOrNull(qr.encodedImage),expiresAt:stringOrNull(qr.expirationDate)};
    if(!result.qrCodePayload||!result.qrCodeImageBase64)throw new Error("INVALID_ASAAS_PIX_QR_CODE");
    return result;
  }

  async findPaymentByExternalReference(externalReference:string):Promise<ProviderCharge|null>{
    const query=new URLSearchParams({externalReference,limit:"2",offset:"0"});
    const result=await this.request<AsaasList>(`/payments?${query.toString()}`);
    if(!Array.isArray(result.data))throw new Error("INVALID_ASAAS_PAYMENT_LIST");
    const matches=result.data.filter((item):item is AsaasPayment=>isRecord(item)&&item.externalReference===externalReference);
    if(matches.length>1)throw new Error("ASAAS_DUPLICATE_EXTERNAL_REFERENCE");
    return matches.length===1?normalizePayment(matches[0]):null;
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
    return safeTokenEquals(receivedToken,expectedToken);
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
    const headers:Record<string,string>={accept:"application/json",access_token:this.config.apiKey,"user-agent":"StarCarvalhos-Sandbox/1.0"};
    if(init.body!==undefined)headers["content-type"]="application/json";
    const response=await this.fetcher(`${this.baseUrl}${path}`,{...init,headers:{...headers,...init.headers},cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(!response.ok){const detail=publicErrorDetail(body);throw new AsaasPublicError(response.status,detail.code,detail.description)}
    return body as T;
  }
}

function publicErrorDetail(body:unknown){
  if(!isRecord(body))return{code:null,description:null};
  const errors=(body as AsaasErrorBody).errors;
  const first=Array.isArray(errors)&&isRecord(errors[0])?errors[0]:null;
  return{code:sanitizeCode(first?.code),description:sanitizeDescription(first?.description)};
}
function sanitizeCode(value:unknown){return typeof value==="string"&&/^[A-Za-z0-9_.-]{1,64}$/.test(value)?value:null}
function sanitizeDescription(value:unknown){
  if(typeof value!=="string")return null;
  return value.replace(/(access[_-]?token|api[_-]?key|authorization|payload|encodedImage)\s*[:=]\s*\S+/gi,"[redacted]").replace(/\b(?:pay|cus)_[A-Za-z0-9_-]+\b/g,"[redacted-id]").replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,"[redacted-id]").replace(/[\r\n\t]+/g," ").trim().slice(0,160)||null;
}

export function safeTokenEquals(receivedToken:string|null,expectedToken:string){
  if(!receivedToken||!expectedToken)return false;
  const received=Buffer.from(receivedToken);const expected=Buffer.from(expectedToken);
  return received.length===expected.length&&timingSafeEqual(received,expected);
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
  return{providerPaymentId:value.id,providerCustomerId:value.customer,providerStatus:value.status,billingType:stringOrNull(value.billingType),amount:numberOrNull(value.value)??0,externalReference:stringOrNull(value.externalReference)??"",hostedPaymentUrl:stringOrNull(value.invoiceUrl),qrCodePayload:null,qrCodeImageBase64:null,expiresAt:null};
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
function stringOrNull(value:unknown){return typeof value==="string"?value:null}
function numberOrNull(value:unknown){const number=typeof value==="number"?value:typeof value==="string"?Number(value):NaN;return Number.isFinite(number)?number:null}

