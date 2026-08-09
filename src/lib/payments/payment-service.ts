import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "./provider-factory";
import type { PaymentProvider, ProviderWebhookEvent } from "./payment-provider";

type Reservation={paymentId:string;transactionId:string;state:string;amount:number;isCreator:boolean;qrCodePayload?:string|null;qrCodeImageBase64?:string|null;expiresAt?:string|null;hostedPaymentUrl?:string|null};

export class PaymentService{
  constructor(private readonly provider:PaymentProvider=getPaymentProvider(),private readonly admin=createAdminClient()){}

  async createPix(sessionId:string,userClient:SupabaseClient){
    const{data,error}=await userClient.rpc("reserve_pix_payment",{session_id:sessionId,request_key:crypto.randomUUID()});
    if(error)throw new Error(error.message);
    const reservation=data as Reservation;
    if(!reservation.isCreator)return reservation;
    const customerId=process.env.ASAAS_SANDBOX_CUSTOMER_ID;
    if(!customerId){await this.fail(reservation.transactionId,"ASAAS_SANDBOX_CUSTOMER_NOT_CONFIGURED");throw new Error("ASAAS_SANDBOX_CUSTOMER_NOT_CONFIGURED");}
    try{
      const charge=await this.provider.createPixCharge({customerId,amount:Number(reservation.amount),dueDate:sandboxDueDate(),description:"Estadia Star Carvalhos",externalReference:`starcarvalhos:parking:${reservation.paymentId}`});
      const{error:saveError}=await this.admin.rpc("mark_provider_payment_created",{transaction_id:reservation.transactionId,provider_payment_id:charge.providerPaymentId,provider_customer_id:charge.providerCustomerId,provider_status:charge.providerStatus,hosted_payment_url:charge.hostedPaymentUrl,qr_code_payload:charge.qrCodePayload,qr_code_image_base64:charge.qrCodeImageBase64,expires_at:charge.expiresAt});
      if(saveError)throw new Error(saveError.message);
      return{...reservation,state:"PENDING",qrCodePayload:charge.qrCodePayload,qrCodeImageBase64:charge.qrCodeImageBase64,expiresAt:charge.expiresAt,hostedPaymentUrl:charge.hostedPaymentUrl};
    }catch(error){await this.fail(reservation.transactionId,error instanceof Error?error.message:"ASAAS_CREATE_FAILED");throw error}
  }

  async getPix(sessionId:string,userClient:SupabaseClient){const{data,error}=await userClient.rpc("get_provider_payment",{session_id:sessionId});if(error)throw new Error(error.message);return data as Reservation|null}

  async processWebhook(event:ProviderWebhookEvent){
    const sanitized={event:event.type,paymentId:event.paymentId,status:event.paymentStatus,value:event.amount,billingType:event.billingType,externalReference:event.externalReference};
    const{data,error}=await this.admin.rpc("process_asaas_webhook",{event_id:event.id,event_type:event.type,provider_payment_id:event.paymentId,provider_status:event.paymentStatus,reported_amount:event.amount,sanitized_payload:sanitized});
    if(error)throw new Error(error.message);return data;
  }

  private async fail(transactionId:string,code:string){await this.admin.rpc("mark_provider_payment_failed",{transaction_id:transactionId,error_code:code.slice(0,100)})}
}

function sandboxDueDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bahia",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
