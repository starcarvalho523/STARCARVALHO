import { createClient } from "@/lib/supabase/server";

export async function POST(request:Request){
  try{
    const body=await request.json();const billingPeriodId=typeof body?.billingPeriodId==="string"?body.billingPeriodId:"";
    if(!billingPeriodId)return Response.json({error:"BILLING_PERIOD_ID_REQUIRED"},{status:400});
    const supabase=await createClient();const{data,error}=await supabase.rpc("record_monthly_cash_payment",{billing_period_id:billingPeriodId,request_key:crypto.randomUUID()});
    if(error)throw new Error(error.message);return Response.json({payment:{id:data,state:"PAID"}},{headers:{"cache-control":"no-store"}});
  }catch(error){const message=error instanceof Error?error.message:"PAYMENT_ERROR";const status=/FORBIDDEN|OPERATOR_REQUIRED|AUTHENTICATION/.test(message)?403:/NOT_FOUND/.test(message)?404:/SHIFT_REQUIRED|NOT_PAYABLE|METHOD_CHANGE/.test(message)?409:500;return Response.json({error:publicError(message)},{status})}
}
function publicError(message:string){if(message.includes("SHIFT_REQUIRED"))return"Abra o caixa antes de receber em dinheiro.";if(message.includes("METHOD_CHANGE"))return"Já existe uma cobrança ativa para esta competência.";if(message.includes("NOT_PAYABLE"))return"Esta competência não está disponível para pagamento.";return"Não foi possível registrar o pagamento em dinheiro."}
