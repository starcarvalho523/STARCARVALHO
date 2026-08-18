import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { AsaasPublicError } from "./asaas-provider";
import { getPaymentProvider } from "./provider-factory";
import { checkoutResolutionDisposition, selectCheckoutCandidates, type CheckoutCandidate } from "./checkout-webhook-reconciliation";
import type { PaymentProvider, ProviderCharge, ProviderCheckoutWebhookEvent, ProviderWebhookEvent } from "./payment-provider";
import type { PaymentSubject } from "./payment-model";

type Reservation={paymentId:string;transactionId:string;state:string;amount:number;isCreator:boolean;qrCodePayload?:string|null;qrCodeImageBase64?:string|null;expiresAt?:string|null;hostedPaymentUrl?:string|null};
type RecoveryContext={transactionId:string;state:string;externalReference:string;providerPaymentId:string|null;providerCustomerId:string|null;providerStatus:string|null;providerAmount:number|null;hostedPaymentUrl:string|null;amount:number};
type StoredCheckoutEvent={id:string;type:string;paymentId:string;paymentStatus:string;amount:number;billingType:string;externalReference:string|null};
type PaymentCustomerContext={user_id:string;full_name:string;email:string|null;billing_document:string|null;external_reference:string;provider_customer_id:string|null};

export class PaymentService{
  constructor(private readonly provider?:PaymentProvider,private readonly admin=createAdminClient()){}

  async createPix(sessionId:string,userClient:SupabaseClient){return this.createPixFor({type:"PARKING_SESSION",id:sessionId},userClient)}
  async createMonthlyPix(billingPeriodId:string,userClient:SupabaseClient){return this.createPixFor({type:"MONTHLY_BILLING_PERIOD",id:billingPeriodId},userClient)}
  private async createPixFor(subject:PaymentSubject,userClient:SupabaseClient){
    const rpc=subject.type==="PARKING_SESSION"?"reserve_pix_payment":"reserve_monthly_pix_payment";
    const args=subject.type==="PARKING_SESSION"?{session_id:subject.id,request_key:crypto.randomUUID()}:{billing_period_id:subject.id,request_key:crypto.randomUUID()};
    const{data,error}=await userClient.rpc(rpc,args);
    if(error)throw new Error(error.message);
    const reservation=data as Reservation;
    if(!reservation.isCreator)return publicPayment(reservation);

    const context=await this.recoveryContext(reservation.transactionId);
    const provider=this.provider??getPaymentProvider();
    let charge:ProviderCharge;

    if(context.providerPaymentId){
      charge={providerPaymentId:context.providerPaymentId,providerCustomerId:context.providerCustomerId??"",providerStatus:context.providerStatus??"PENDING",billingType:"PIX",amount:Number(context.providerAmount??context.amount),externalReference:context.externalReference,hostedPaymentUrl:context.hostedPaymentUrl,qrCodePayload:null,qrCodeImageBase64:null,expiresAt:null};
      validateReconciledCharge(charge,context);
    }else{
      let reconciled:ProviderCharge|null;
      try{
        reconciled=await provider.findPaymentByExternalReference(context.externalReference);
      }catch(error){
        if(error instanceof Error&&error.message==="ASAAS_DUPLICATE_EXTERNAL_REFERENCE")await this.markManualReview(context.transactionId);
        await this.markReconciliationPending(context.transactionId,error);
        logPaymentError("asaas.reconcile",error);
        throw error;
      }
      if(reconciled){
        validateReconciledCharge(reconciled,context);
        charge=reconciled;
      }else{
        if(context.state!=="CREATING"){
          const error=new Error("ASAAS_RECONCILIATION_NOT_FOUND");
          await this.markReconciliationPending(context.transactionId,error);
          logPaymentError("asaas.reconcile",error);
          throw error;
        }
        try{
          const customerId=await this.resolveProviderCustomer(subject,provider);
          charge=await provider.createPixPayment({customerId,amount:Number(context.amount),dueDate:paymentDueDate(),description:subject.type==="PARKING_SESSION"?"Estadia Star Carvalhos":"Mensalidade Star Carvalhos",externalReference:context.externalReference});
        }catch(error){
          await this.markReconciliationPending(context.transactionId,error);
          logPaymentError("asaas.create",error);
          throw error;
        }
      }
      try{await this.persistExternalCharge(context,charge)}catch(error){await this.markReconciliationPending(context.transactionId,error);throw error}
    }

    try{
      const qr=await provider.getPixQrCode(charge.providerPaymentId);
      const{error:qrSaveError}=await this.admin.rpc("mark_provider_pix_qr_ready",{transaction_id:context.transactionId,qr_code_payload:qr.qrCodePayload,qr_code_image_base64:qr.qrCodeImageBase64,expires_at:qr.expiresAt});
      if(qrSaveError)throw rpcError("mark_provider_pix_qr_ready",qrSaveError.message);
      return publicPayment({...reservation,state:"PENDING",qrCodePayload:qr.qrCodePayload,qrCodeImageBase64:qr.qrCodeImageBase64,expiresAt:qr.expiresAt,hostedPaymentUrl:charge.hostedPaymentUrl});
    }catch(error){
      await this.markQrPending(context.transactionId,error);
      logPaymentError("asaas.pixQrCode",error);
      throw error;
    }
  }

  async getPix(sessionId:string,userClient:SupabaseClient){const{data,error}=await userClient.rpc("get_provider_payment",{session_id:sessionId});if(error)throw new Error(error.message);return data?publicPayment(data as Reservation):null}
  async getMonthlyPix(billingPeriodId:string,userClient:SupabaseClient){const{data,error}=await userClient.rpc("get_monthly_provider_payment",{billing_period_id:billingPeriodId,payment_method:"PIX"});if(error)throw new Error(error.message);return data?publicPayment(data as Reservation):null}

  async createCreditCheckout(sessionId:string,userClient:SupabaseClient,origin:string){return this.createCreditCheckoutFor({type:"PARKING_SESSION",id:sessionId},userClient,origin)}
  async createMonthlyCreditCheckout(billingPeriodId:string,userClient:SupabaseClient,origin:string){return this.createCreditCheckoutFor({type:"MONTHLY_BILLING_PERIOD",id:billingPeriodId},userClient,origin)}
  private async createCreditCheckoutFor(subject:PaymentSubject,userClient:SupabaseClient,origin:string){
    const rpc=subject.type==="PARKING_SESSION"?"reserve_credit_checkout":"reserve_monthly_credit_checkout";
    const args=subject.type==="PARKING_SESSION"?{session_id:subject.id,request_key:crypto.randomUUID()}:{billing_period_id:subject.id,request_key:crypto.randomUUID()};
    const{data,error}=await userClient.rpc(rpc,args);if(error)throw new Error(error.message);
    const reservation=data as Reservation;if(!reservation.isCreator)return publicCheckout(reservation);
    const context=await this.recoveryContext(reservation.transactionId);const provider=this.provider??getPaymentProvider();
    try{
      const customerId=await this.resolveProviderCustomer(subject,provider);
      const checkout=await provider.createCreditCardCheckout({customerId,amount:Number(context.amount),description:subject.type==="PARKING_SESSION"?"Pagamento de estadia":"Pagamento de mensalidade",externalReference:context.externalReference,expiresInMinutes:45,callback:{successUrl:`${origin}/pagamento/retorno?status=success`,cancelUrl:`${origin}/pagamento/retorno?status=cancel`,expiredUrl:`${origin}/pagamento/retorno?status=expired`}});
      const{error:saveError}=await this.admin.rpc("mark_credit_checkout_created",{transaction_id:context.transactionId,checkout_id:checkout.providerCheckoutId,checkout_status:checkout.providerStatus,checkout_link:checkout.link,external_reference:checkout.externalReference,checkout_amount:checkout.amount,expires_at:checkout.expiresAt});if(saveError)throw rpcError("mark_credit_checkout_created",saveError.message);
      return publicCheckout({...reservation,state:"PENDING",hostedPaymentUrl:checkout.link,expiresAt:checkout.expiresAt});
    }catch(cause){logPaymentError("asaas.checkout.create",cause);throw cause}
  }

  async getCreditCheckout(sessionId:string,userClient:SupabaseClient){const{data,error}=await userClient.rpc("get_credit_checkout",{session_id:sessionId});if(error)throw new Error(error.message);return data?publicCheckout(data as Reservation):null}
  async getMonthlyCreditCheckout(billingPeriodId:string,userClient:SupabaseClient){const{data,error}=await userClient.rpc("get_monthly_provider_payment",{billing_period_id:billingPeriodId,payment_method:"CREDIT_CARD"});if(error)throw new Error(error.message);return data?publicCheckout(data as Reservation):null}

  async reprocessStoredCheckoutEvents(sessionId:string,eventIds:string[],userClient:SupabaseClient){
    await this.getCreditCheckout(sessionId,userClient);
    const{data,error}=await this.admin.rpc("get_checkout_payment_events_for_reprocessing",{session_id:sessionId,event_ids:eventIds});
    if(error)throw rpcError("get_checkout_payment_events_for_reprocessing",error.message);
    const events=(Array.isArray(data)?data:[]) as StoredCheckoutEvent[];
    const results=[];
    for(const event of events){
      const result=await this.processWebhook({id:event.id,type:event.type,paymentId:event.paymentId,paymentStatus:event.paymentStatus,amount:Number(event.amount),billingType:event.billingType,externalReference:event.externalReference,checkoutId:null});
      results.push({type:event.type,result});
    }
    return results;
  }

  async processWebhook(event:ProviderWebhookEvent){
    const sanitized={event:event.type,paymentId:event.paymentId,status:event.paymentStatus,value:event.amount,billingType:event.billingType,externalReference:event.externalReference};
    if(event.billingType==="CREDIT_CARD"&&(event.type==="PAYMENT_CREATED"||event.type==="PAYMENT_CONFIRMED")){
      return this.processCheckoutPaymentWebhook(event,sanitized);
    }
    const{data,error}=await this.admin.rpc("process_asaas_webhook",{event_id:event.id,event_type:event.type,provider_payment_id:event.paymentId,provider_status:event.paymentStatus,reported_amount:event.amount,sanitized_payload:sanitized});
    if(error)throw new Error(error.message);return data;
  }

  private async processCheckoutPaymentWebhook(event:ProviderWebhookEvent,sanitized:Record<string,unknown>){
    if(event.amount===null){
      const{error:reviewError}=await this.admin.rpc("mark_checkout_payment_event_review",{event_id:event.id,event_type:event.type,provider_payment_id:event.paymentId,provider_status:event.paymentStatus,sanitized_payload:sanitized,reason_code:"CHECKOUT_PAYMENT_INVALID_AMOUNT"});
      if(reviewError)throw rpcError("mark_checkout_payment_event_review",reviewError.message);
      return{result:"review"};
    }
    const{data,error}=await this.admin.rpc("get_credit_checkout_reconciliation_candidates",{reported_amount:event.amount});
    if(error)throw rpcError("get_credit_checkout_reconciliation_candidates",error.message);
    const candidates=selectCheckoutCandidates((Array.isArray(data)?data:[]) as CheckoutCandidate[],event.amount,event.checkoutId);
    const provider=this.provider??getPaymentProvider();
    const matches=[];
    let requiresReview=false;
    for(const candidate of candidates){
      try{
        const resolved=await provider.resolveCheckoutPayment(candidate.checkoutId,candidate.externalReference,event.paymentId,Number(candidate.amount));
        if(resolved.amount===Number(candidate.amount)&&resolved.billingType==="CREDIT_CARD")matches.push({candidate,resolved});
      }catch(cause){
        const disposition=checkoutResolutionDisposition(cause);
        if(disposition==="NO_MATCH")continue;
        if(disposition==="REVIEW")requiresReview=true;
        logPaymentError("asaas.checkout.reconcile",cause);
      }
    }
    if(matches.length!==1){
      const review=requiresReview||matches.length>1;
      const{error:unknownError}=await this.admin.rpc("mark_checkout_payment_event_review",{event_id:event.id,event_type:event.type,provider_payment_id:event.paymentId,provider_status:event.paymentStatus,sanitized_payload:sanitized,reason_code:review?"CHECKOUT_PAYMENT_AMBIGUOUS":"CHECKOUT_PAYMENT_UNKNOWN"});
      if(unknownError)throw rpcError("mark_checkout_payment_event_review",unknownError.message);
      return{result:review?"review":"unknown"};
    }
    const match=matches[0];
    const{data:result,error:processError}=await this.admin.rpc("process_asaas_checkout_payment_webhook",{event_id:event.id,event_type:event.type,provider_payment_id:event.paymentId,provider_checkout_id:match.resolved.providerCheckoutId,provider_status:event.paymentStatus,reported_amount:event.amount,billing_type:event.billingType,external_reference:match.resolved.externalReference,sanitized_payload:sanitized});
    if(processError)throw rpcError("process_asaas_checkout_payment_webhook",processError.message);
    return result;
  }

  async processCheckoutWebhook(event:ProviderCheckoutWebhookEvent){
    const sanitized={event:event.type,checkoutId:event.checkoutId,status:event.checkoutStatus,externalReference:event.externalReference};
    const{data,error}=await this.admin.rpc("process_asaas_checkout_webhook",{event_id:event.id,event_type:event.type,checkout_id:event.checkoutId,checkout_status:event.checkoutStatus,external_reference:event.externalReference,sanitized_payload:sanitized});
    if(error)throw new Error(error.message);return data;
  }

  private async resolveProviderCustomer(subject:PaymentSubject,provider:PaymentProvider){
    const{data,error}=await this.admin.rpc("get_payment_customer_context",{subject_type:subject.type,subject_id:subject.id,target_provider:provider.name,target_environment:provider.environment});
    if(error)throw rpcError("get_payment_customer_context",error.message);
    const customer=data as PaymentCustomerContext;
    if(customer.provider_customer_id)return customer.provider_customer_id;
    const document=String(customer.billing_document??"").replace(/\D/g,"");
    if(!/^(?:\d{11}|\d{14})$/.test(document))throw new Error("CUSTOMER_BILLING_DOCUMENT_REQUIRED");

    let providerCustomer;
    try{
      providerCustomer=await provider.findCustomerByExternalReference(customer.external_reference);
      if(!providerCustomer){
        providerCustomer=await provider.createCustomer({name:customer.full_name,cpfCnpj:document,email:customer.email,externalReference:customer.external_reference});
      }
    }catch(error){
      logPaymentError("asaas.customer.resolve",error);
      throw error;
    }

    const{data:bound,error:bindError}=await this.admin.rpc("bind_payment_provider_customer",{customer_user_id:customer.user_id,target_provider:provider.name,target_environment:provider.environment,target_provider_customer_id:providerCustomer.providerCustomerId,target_external_reference:customer.external_reference});
    if(bindError)throw rpcError("bind_payment_provider_customer",bindError.message);
    return String(bound??providerCustomer.providerCustomerId);
  }

  private async recoveryContext(transactionId:string){
    const{data,error}=await this.admin.rpc("get_provider_recovery_context",{transaction_id:transactionId});
    if(error)throw rpcError("get_provider_recovery_context",error.message);
    return data as RecoveryContext;
  }

  private async persistExternalCharge(context:RecoveryContext,charge:ProviderCharge){
    const{error}=await this.admin.rpc("mark_provider_external_created",{transaction_id:context.transactionId,provider_payment_id:charge.providerPaymentId,provider_customer_id:charge.providerCustomerId,provider_status:charge.providerStatus,provider_amount:charge.amount,external_reference:charge.externalReference,hosted_payment_url:charge.hostedPaymentUrl});
    if(error){const wrapped=rpcError("mark_provider_external_created",error.message);logPaymentError("supabase.persistExternal",wrapped);throw wrapped}
  }

  private async markQrPending(transactionId:string,error:unknown){
    const detail=errorDetail(error);
    await this.admin.rpc("mark_provider_pix_qr_pending",{transaction_id:transactionId,error_code:detail.code,error_description:detail.description});
  }

  private async markReconciliationPending(transactionId:string,error:unknown){
    const detail=errorDetail(error);
    await this.admin.rpc("mark_provider_reconciliation_pending",{transaction_id:transactionId,error_code:detail.code,error_description:detail.description});
  }

  private async markManualReview(transactionId:string){await this.admin.rpc("mark_provider_manual_review",{transaction_id:transactionId,reason_code:"DUPLICATE_EXTERNAL_REFERENCE"})}
}

function paymentDueDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bahia",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function publicPayment(value:Reservation){return{state:value.state,amount:Number(value.amount),qrCodePayload:value.qrCodePayload??null,qrCodeImageBase64:value.qrCodeImageBase64??null,expiresAt:value.expiresAt??null,hostedPaymentUrl:value.hostedPaymentUrl??null}}
function publicCheckout(value:Reservation){return{state:value.state,amount:Number(value.amount),hostedPaymentUrl:value.hostedPaymentUrl??null,expiresAt:value.expiresAt??null}}
function validateReconciledCharge(charge:ProviderCharge,context:RecoveryContext){
  if(charge.billingType!=="PIX"||charge.externalReference!==context.externalReference||Number(charge.amount)!==Number(context.amount))throw new Error("ASAAS_RECONCILIATION_MISMATCH");
}
function rpcError(rpc:string,message:string){const error=new Error(`RPC_FAILED_${rpc}`);error.name="SupabaseRpcError";(error as Error&{rpc?:string}).rpc=rpc;(error as Error&{cause?:unknown}).cause=message;return error}
function errorDetail(error:unknown){
  if(error instanceof AsaasPublicError)return{code:error.message.slice(0,100),description:error.publicDescription};
  return{code:error instanceof Error?error.message.slice(0,100):"PAYMENT_PROVIDER_ERROR",description:null};
}
function logPaymentError(stage:string,error:unknown){
  if(error instanceof AsaasPublicError){console.error(JSON.stringify({step:stage,httpStatus:error.status,code:error.publicCode??"UNKNOWN",description:error.publicDescription??""}));return}
  const detail=errorDetail(error);const rpc=error instanceof Error?(error as Error&{rpc?:string}).rpc:undefined;
  console.error(JSON.stringify({step:stage,errorName:error instanceof Error?error.name:"UnknownError",code:detail.code,rpc}));
}
