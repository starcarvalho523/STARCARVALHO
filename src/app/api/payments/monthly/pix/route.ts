import { createClient } from "@/lib/supabase/server";
import { PaymentService } from "@/lib/payments/payment-service";

export async function GET(request:Request){
  try{const billingPeriodId=new URL(request.url).searchParams.get("billingPeriodId");if(!billingPeriodId)return Response.json({error:"BILLING_PERIOD_ID_REQUIRED"},{status:400});const payment=await new PaymentService().getMonthlyPix(billingPeriodId,await createClient());return Response.json({payment},{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}
export async function POST(request:Request){
  try{const body=await request.json();const billingPeriodId=typeof body?.billingPeriodId==="string"?body.billingPeriodId:"";if(!billingPeriodId)return Response.json({error:"BILLING_PERIOD_ID_REQUIRED"},{status:400});const payment=await new PaymentService().createMonthlyPix(billingPeriodId,await createClient());return Response.json({payment},{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}
function failure(error:unknown){const message=error instanceof Error?error.message:"PAYMENT_ERROR";const status=/FORBIDDEN|AUTHENTICATION/.test(message)?403:/NOT_FOUND/.test(message)?404:/NOT_PAYABLE|METHOD_CHANGE|ALREADY/.test(message)?409:503;return Response.json({error:publicError(message)},{status})}
function publicError(message:string){if(message.includes("METHOD_CHANGE"))return"Já existe uma cobrança ativa para esta competência.";if(message.includes("NOT_PAYABLE"))return"Esta competência não está disponível para pagamento.";if(message.includes("FORBIDDEN"))return"Você não pode acessar esta competência.";return"Não foi possível iniciar o PIX agora."}
