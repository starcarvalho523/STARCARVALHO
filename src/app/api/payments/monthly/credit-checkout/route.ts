import { createClient } from "@/lib/supabase/server";
import { PaymentService } from "@/lib/payments/payment-service";
import { prepareMonthlyPaymentAttempt } from "@/lib/payments/monthly-payment-attempt-switch";

export async function GET(request:Request){
  try{const billingPeriodId=new URL(request.url).searchParams.get("billingPeriodId");if(!billingPeriodId)return Response.json({error:"BILLING_PERIOD_ID_REQUIRED"},{status:400});const checkout=await new PaymentService().getMonthlyCreditCheckout(billingPeriodId,await createClient());return Response.json({checkout},{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}
export async function POST(request:Request){
  try{const body=await request.json();const billingPeriodId=typeof body?.billingPeriodId==="string"?body.billingPeriodId:"";if(!billingPeriodId)return Response.json({error:"BILLING_PERIOD_ID_REQUIRED"},{status:400});const origin=new URL(request.url).origin;const client=await createClient();await prepareMonthlyPaymentAttempt(billingPeriodId,"CREDIT_CARD",client);const checkout=await new PaymentService().createMonthlyCreditCheckout(billingPeriodId,client,origin);return Response.json({checkout},{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}
function failure(error:unknown){const message=error instanceof Error?error.message:"PAYMENT_ERROR";const status=/FORBIDDEN|AUTHENTICATION/.test(message)?403:/NOT_FOUND/.test(message)?404:/NOT_PAYABLE|ALREADY|AUTO_RENEW_ACTIVE/.test(message)?409:/SWITCH_PROVIDER_REFERENCE_PENDING/.test(message)?425:503;return Response.json({error:publicError(message)},{status})}
function publicError(message:string){if(message.includes("AUTO_RENEW_ACTIVE"))return"A renovação automática no cartão já está ativa. Desative-a antes de iniciar um pagamento manual.";if(message.includes("SWITCH_PROVIDER_REFERENCE_PENDING"))return"O pagamento anterior ainda está sendo preparado. Tente trocar novamente em alguns segundos.";if(message.includes("NOT_PAYABLE"))return"Esta competência não está disponível para pagamento.";if(message.includes("FORBIDDEN"))return"Você não pode acessar esta competência.";if(message.includes("ASAAS_CHECKOUT_CANCEL_FAILED"))return"Não foi possível encerrar o pagamento anterior agora. Tente novamente.";return"Não foi possível iniciar o checkout agora."}
