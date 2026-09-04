import { timingSafeEqual } from "node:crypto";
import type { CreateChargeInput, CreateCheckoutInput, CreateProviderCustomerInput, CreateRecurringCardSubscriptionInput, PaymentProvider, ProviderCharge, ProviderCheckout, ProviderCheckoutPayment, ProviderCustomer, ProviderPaymentState, ProviderPixQrCode, ProviderRecurringSubscription, ProviderWebhookEvent, ProviderCheckoutWebhookEvent } from "./payment-provider";

type Fetcher = typeof fetch;
type AsaasPayment = { id?:unknown; customer?:unknown; status?:unknown; billingType?:unknown; value?:unknown; dueDate?:unknown; externalReference?:unknown; invoiceUrl?:unknown; checkoutSession?:unknown; subscription?:unknown };
type AsaasCustomer = { id?:unknown; externalReference?:unknown };
type AsaasQrCode = { payload?:unknown; encodedImage?:unknown; expirationDate?:unknown };
type AsaasList = { data?:unknown };
type AsaasErrorBody = { errors?:unknown };
type AsaasCheckout = { id?:unknown; status?:unknown; link?:unknown; externalReference?:unknown; minutesToExpire?:unknown; billingTypes?:unknown };
type AsaasSubscription = { id?:unknown; customer?:unknown; status?:unknown; billingType?:unknown; value?:unknown; cycle?:unknown; nextDueDate?:unknown; externalReference?:unknown };

export class AsaasPublicError extends Error {
  constructor(readonly status:number,readonly publicCode:string|null,readonly publicDescription:string|null){
    super(`ASAAS_HTTP_${status}${publicCode?`_${publicCode}`:""}`);
    this.name="AsaasPublicError";
  }
}

export type AsaasProviderConfig = { apiKey:string; baseUrl:string; environment:"sandbox"|"production"; fetcher?:Fetcher };

export class AsaasProvider implements PaymentProvider {
  readonly name = "ASAAS" as const;
  readonly environment: "SANDBOX" | "PRODUCTION";
  readonly capabilities = [{method:"PIX",channel:"QR"},{method:"CREDIT_CARD",channel:"HOSTED_CHECKOUT"}] as const;
  private readonly fetcher: Fetcher;
  private readonly baseUrl: string;

  constructor(private readonly config:AsaasProviderConfig) {
    const baseUrl=config.baseUrl.replace(/\/$/,"");
    const expected=config.environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
    if(baseUrl!==expected)throw new Error("ASAAS_BASE_URL_ENVIRONMENT_MISMATCH");
    if(!config.apiKey) throw new Error("ASAAS_API_KEY_NOT_CONFIGURED");
    this.environment=config.environment==="sandbox"?"SANDBOX":"PRODUCTION";
    this.baseUrl=baseUrl;
    this.fetcher=config.fetcher??fetch;
  }

  async findCustomerByExternalReference(externalReference:string):Promise<ProviderCustomer|null>{
    const query=new URLSearchParams({externalReference,limit:"2",offset:"0"});
    const result=await this.request<AsaasList>(`/customers?${query.toString()}`);
    if(!Array.isArray(result.data))throw new Error("INVALID_ASAAS_CUSTOMER_LIST");
    const matches=result.data.filter((item):item is AsaasCustomer=>isRecord(item)&&item.externalReference===externalReference);
    if(matches.length>1)throw new Error("ASAAS_DUPLICATE_CUSTOMER_EXTERNAL_REFERENCE");
    return matches.length===1?normalizeCustomer(matches[0]):null;
  }

  async createCustomer(input:CreateProviderCustomerInput):Promise<ProviderCustomer>{
    const customer=await this.request<AsaasCustomer>("/customers",{method:"POST",body:JSON.stringify({
      name:input.name,cpfCnpj:input.cpfCnpj,email:input.email||undefined,externalReference:input.externalReference,notificationDisabled:false,
    })});
    const normalized=normalizeCustomer(customer);
    if(normalized.externalReference!==input.externalReference)throw new Error("ASAAS_CUSTOMER_EXTERNAL_REFERENCE_MISMATCH");
    return normalized;
  }

  async createPixPayment(input:CreateChargeInput):Promise<ProviderCharge>{return this.createCharge("PIX",input)}

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

  async createCreditCardPayment(input:CreateChargeInput):Promise<ProviderCharge>{return this.createCharge("CREDIT_CARD",input)}

  async createCreditCardCheckout(input:CreateCheckoutInput):Promise<ProviderCheckout>{
    const recurring=Boolean(input.recurrence);
    const body=(customerId:string|null|undefined)=>JSON.stringify({
      billingTypes:["CREDIT_CARD"],chargeTypes:[recurring?"RECURRENT":"DETACHED"],minutesToExpire:input.expiresInMinutes,
      externalReference:input.externalReference,callback:input.callback,customer:customerId||undefined,
      items:[{externalReference:recurring?"monthly-membership":"parking-stay",name:recurring?"Mensalidade Star Carvalhos":"Estadia Star Carvalhos",description:input.description,quantity:1,value:input.amount}],
      subscription:input.recurrence?{cycle:input.recurrence.cycle,nextDueDate:input.recurrence.nextDueDate,...(input.recurrence.endDate?{endDate:input.recurrence.endDate}:{})}:undefined,
    });
    let checkout:AsaasCheckout;
    try{checkout=await this.request<AsaasCheckout>("/checkouts",{method:"POST",body:body(input.customerId)})}
    catch(error){
      const missingCustomerPhone=error instanceof AsaasPublicError&&error.status===400&&error.publicCode==="invalid_object"&&/phone.*customer/i.test(error.publicDescription??"");
      if(!input.customerId||!missingCustomerPhone)throw error;
      checkout=await this.request<AsaasCheckout>("/checkouts",{method:"POST",body:body(null)});
    }
    if(typeof checkout.id!=="string"||typeof checkout.status!=="string"||typeof checkout.link!=="string"||checkout.externalReference!==input.externalReference)throw new Error("INVALID_ASAAS_CHECKOUT");
    return{providerCheckoutId:checkout.id,providerStatus:checkout.status,amount:input.amount,externalReference:input.externalReference,link:checkout.link,expiresAt:new Date(Date.now()+input.expiresInMinutes*60_000).toISOString()};
  }

  async findRecurringSubscriptionByExternalReference(externalReference:string):Promise<ProviderRecurringSubscription|null>{
    const query=new URLSearchParams({externalReference,limit:"2",offset:"0"});
    const result=await this.request<AsaasList>(`/subscriptions?${query.toString()}`);
    if(!Array.isArray(result.data))throw new Error("INVALID_ASAAS_SUBSCRIPTION_LIST");
    const matches=result.data.filter((item):item is AsaasSubscription=>isRecord(item)&&item.externalReference===externalReference);
    if(matches.length>1)throw new Error("ASAAS_DUPLICATE_SUBSCRIPTION_EXTERNAL_REFERENCE");
    return matches.length===1?normalizeSubscription(matches[0]):null;
  }

  async createRecurringCardSubscription(input:CreateRecurringCardSubscriptionInput):Promise<ProviderRecurringSubscription>{
    const body={
      customer:input.customerId,
      billingType:"CREDIT_CARD",
      value:input.amount,
      nextDueDate:input.nextDueDate,
      cycle:"MONTHLY",
      description:input.description,
      externalReference:input.externalReference,
      creditCard:input.creditCard,
      creditCardHolderInfo:input.creditCardHolderInfo,
      remoteIp:input.remoteIp,
    };
    const subscription=await this.request<AsaasSubscription>("/subscriptions",{
      method:"POST",
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(65_000),
    });
    const normalized=normalizeSubscription(subscription);
    if(normalized.providerCustomerId!==input.customerId||normalized.billingType!=="CREDIT_CARD"||normalized.cycle!=="MONTHLY"||Number(normalized.amount)!==Number(input.amount)||normalized.nextDueDate!==input.nextDueDate||normalized.externalReference!==input.externalReference)throw new Error("ASAAS_RECURRING_SUBSCRIPTION_MISMATCH");
    return normalized;
  }

  async resolveCheckoutPayment(checkoutId:string,expectedExternalReference:string,expectedPaymentId:string,expectedAmount:number):Promise<ProviderCheckoutPayment>{
    const query=new URLSearchParams({checkoutSession:checkoutId,limit:"2",offset:"0"});
    const payments=await this.request<AsaasList>(`/payments?${query.toString()}`);
    if(!Array.isArray(payments.data))throw new Error("INVALID_ASAAS_PAYMENT_LIST");
    if(payments.data.length===0)throw new Error("ASAAS_CHECKOUT_PAYMENT_NOT_FOUND");
    if(payments.data.length!==1)throw new Error("ASAAS_CHECKOUT_PAYMENT_AMBIGUOUS");
    const raw=payments.data[0];if(!isRecord(raw))throw new Error("INVALID_ASAAS_PAYMENT");
    const payment=normalizePayment(raw);
    if(payment.providerPaymentId!==expectedPaymentId)throw new Error("ASAAS_CHECKOUT_PAYMENT_ID_MISMATCH");
    if(payment.billingType!=="CREDIT_CARD")throw new Error("ASAAS_CHECKOUT_PAYMENT_METHOD_MISMATCH");
    if(Number(payment.amount)!==Number(expectedAmount))throw new Error("ASAAS_CHECKOUT_PAYMENT_AMOUNT_MISMATCH");
    if(raw.checkoutSession!==undefined&&raw.checkoutSession!==null&&raw.checkoutSession!==checkoutId)throw new Error("ASAAS_CHECKOUT_SESSION_MISMATCH");
    return{providerCheckoutId:checkoutId,providerCheckoutStatus:"RESOLVED_BY_PAYMENT_LIST",providerPaymentId:payment.providerPaymentId,providerPaymentStatus:payment.providerStatus,amount:payment.amount,billingType:payment.billingType,externalReference:expectedExternalReference};
  }

  async getPayment(providerPaymentId:string):Promise<ProviderCharge>{return normalizePayment(await this.request<AsaasPayment>(`/payments/${encodeURIComponent(providerPaymentId)}`))}
  async cancelPayment(providerPaymentId:string):Promise<void>{await this.request(`/payments/${encodeURIComponent(providerPaymentId)}`,{method:"DELETE"})}
  async listRecurringSubscriptionPayments(providerSubscriptionId:string):Promise<ProviderCharge[]>{
    const result=await this.request<AsaasList>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}/payments`);
    if(!Array.isArray(result.data))throw new Error("INVALID_ASAAS_SUBSCRIPTION_PAYMENT_LIST");
    return result.data.map((item)=>{
      if(!isRecord(item))throw new Error("INVALID_ASAAS_PAYMENT");
      return normalizePayment(item);
    });
  }
  async updateRecurringSubscription(providerSubscriptionId:string,input:{status?:"ACTIVE"|"INACTIVE";nextDueDate?:string;updatePendingPayments?:boolean}):Promise<void>{
    const body={
      ...(input.status?{status:input.status}:{}),
      ...(input.nextDueDate?{nextDueDate:input.nextDueDate}:{}),
      updatePendingPayments:input.updatePendingPayments??false,
    };
    await this.request(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,{method:"PUT",body:JSON.stringify(body)});
  }
  async cancelRecurringSubscription(providerSubscriptionId:string):Promise<void>{await this.request(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,{method:"DELETE"})}
  getHostedPaymentUrl(payment:ProviderCharge){return payment.hostedPaymentUrl}
  validateWebhook(receivedToken:string|null,expectedToken:string){return safeTokenEquals(receivedToken,expectedToken)}

  parseWebhook(payload:unknown):ProviderWebhookEvent{
    if(!isRecord(payload)||typeof payload.id!=="string"||typeof payload.event!=="string"||!isRecord(payload.payment)||typeof payload.payment.id!=="string") throw new Error("INVALID_ASAAS_WEBHOOK");
    const id=payload.id;const type=payload.event;const payment=payload.payment;const paymentId=payment.id as string;
    return{id,type,paymentId,paymentStatus:typeof payment.status==="string"?payment.status:"UNKNOWN",amount:numberOrNull(payment.value),externalReference:stringOrNull(payment.externalReference),billingType:stringOrNull(payment.billingType),checkoutId:stringOrNull(payment.checkoutSession),subscriptionId:stringOrNull(payment.subscription)};
  }

  parseCheckoutWebhook(payload:unknown):ProviderCheckoutWebhookEvent{
    if(!isRecord(payload)||typeof payload.id!=="string"||typeof payload.event!=="string"||!isRecord(payload.checkout)||typeof payload.checkout.id!=="string")throw new Error("INVALID_ASAAS_WEBHOOK");
    return{id:payload.id,type:payload.event,checkoutId:payload.checkout.id,checkoutStatus:typeof payload.checkout.status==="string"?payload.checkout.status:"UNKNOWN",externalReference:stringOrNull(payload.checkout.externalReference)};
  }

  private async createCharge(billingType:"PIX"|"CREDIT_CARD",input:CreateChargeInput){
    const body={customer:input.customerId,billingType,value:input.amount,dueDate:input.dueDate,description:input.description,externalReference:input.externalReference};
    return normalizePayment(await this.request<AsaasPayment>("/payments",{method:"POST",body:JSON.stringify(body)}));
  }

  private async request<T=unknown>(path:string,init:RequestInit={}):Promise<T>{
    const headers:Record<string,string>={accept:"application/json",access_token:this.config.apiKey,"user-agent":`StarCarvalhos-${this.environment}/1.0`};
    if(init.body!==undefined)headers["content-type"]="application/json";
    const response=await this.fetcher(`${this.baseUrl}${path}`,{...init,headers:{...headers,...init.headers},cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(!response.ok){const detail=publicErrorDetail(body);throw new AsaasPublicError(response.status,detail.code,detail.description)}
    return body as T;
  }
}

function publicErrorDetail(body:unknown){if(!isRecord(body))return{code:null,description:null};const errors=(body as AsaasErrorBody).errors;const first=Array.isArray(errors)&&isRecord(errors[0])?errors[0]:null;return{code:sanitizeCode(first?.code),description:sanitizeDescription(first?.description)}}
function sanitizeCode(value:unknown){return typeof value==="string"&&/^[A-Za-z0-9_.-]{1,64}$/.test(value)?value:null}
function sanitizeDescription(value:unknown){if(typeof value!=="string")return null;return value.replace(/(access[_-]?token|api[_-]?key|authorization|payload|encodedImage)\s*[:=]\s*\S+/gi,"[redacted]").replace(/\b(?:pay|cus|sub)_[A-Za-z0-9_-]+\b/g,"[redacted-id]").replace(/\b\d{13,19}\b/g,"[redacted-card]").replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,"[redacted-id]").replace(/[\r\n\t]+/g," ").trim().slice(0,160)||null}
export function safeTokenEquals(receivedToken:string|null,expectedToken:string){if(!receivedToken||!expectedToken)return false;const received=Buffer.from(receivedToken);const expected=Buffer.from(expectedToken);return received.length===expected.length&&timingSafeEqual(received,expected)}
export function mapAsaasPaymentState(status:string,eventType?:string):ProviderPaymentState{if(eventType==="PAYMENT_RECEIVED"||status==="RECEIVED")return "PAID";if(eventType==="PAYMENT_OVERDUE"||status==="OVERDUE")return "EXPIRED";if(eventType==="PAYMENT_DELETED"||status==="DELETED")return "CANCELLED";if(status==="REFUNDED"||status==="CHARGEBACK_REQUESTED"||status==="CHARGEBACK_DISPUTE")return "REVIEW";return "PENDING"}
function normalizeCustomer(value:AsaasCustomer):ProviderCustomer{if(typeof value.id!=="string")throw new Error("INVALID_ASAAS_CUSTOMER");return{providerCustomerId:value.id,externalReference:stringOrNull(value.externalReference)}}
function normalizePayment(value:AsaasPayment):ProviderCharge{if(typeof value.id!=="string"||typeof value.customer!=="string"||typeof value.status!=="string")throw new Error("INVALID_ASAAS_PAYMENT");return{providerPaymentId:value.id,providerCustomerId:value.customer,providerStatus:value.status,billingType:stringOrNull(value.billingType),amount:numberOrNull(value.value)??0,externalReference:stringOrNull(value.externalReference)??"",hostedPaymentUrl:stringOrNull(value.invoiceUrl),qrCodePayload:null,qrCodeImageBase64:null,expiresAt:null,dueDate:stringOrNull(value.dueDate),subscriptionId:stringOrNull(value.subscription),checkoutId:stringOrNull(value.checkoutSession)}}
function normalizeSubscription(value:AsaasSubscription):ProviderRecurringSubscription{if(typeof value.id!=="string"||typeof value.customer!=="string"||typeof value.status!=="string"||typeof value.billingType!=="string"||typeof value.cycle!=="string"||typeof value.nextDueDate!=="string")throw new Error("INVALID_ASAAS_SUBSCRIPTION");return{providerSubscriptionId:value.id,providerCustomerId:value.customer,providerStatus:value.status,billingType:value.billingType,amount:numberOrNull(value.value)??0,cycle:value.cycle,nextDueDate:value.nextDueDate.slice(0,10),externalReference:stringOrNull(value.externalReference)}}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
function stringOrNull(value:unknown){return typeof value==="string"?value:null}
function numberOrNull(value:unknown){const number=typeof value==="number"?value:typeof value==="string"?Number(value):NaN;return Number.isFinite(number)?number:null}
