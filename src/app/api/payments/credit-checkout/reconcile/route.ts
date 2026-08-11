
import { PaymentService } from "@/lib/payments/payment-service";
import { createClient } from "@/lib/supabase/server";

const SESSION_ID="bb2c7ec5-f306-4042-8e60-603bea94c76e";
const EVENT_IDS=["evt_05b708f961d739ea7eba7e4db318f621&17922506","evt_15e444ff9b9ab9ec29294aa1abe68025&17922507"];

export async function GET(){
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>ReconciliaÃ§Ã£o controlada</title></head><body><main><h1>ReconciliaÃ§Ã£o controlada</h1><p>SessÃ£o PKH3C92 Â· R$ 50,00 Â· dois eventos reais armazenados.</p><form method="post"><input type="hidden" name="sessionId" value="${SESSION_ID}"><button type="submit">Reprocessar eventos reais</button></form></main></body></html>`,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}

export async function POST(request:Request){
  try{
    const contentType=request.headers.get("content-type")??"";
    const body=contentType.includes("application/json")?await request.json():Object.fromEntries(await request.formData());
    const sessionId=typeof body?.sessionId==="string"?body.sessionId:"";
    if(sessionId!==SESSION_ID)return Response.json({error:"PAYMENT_NOT_AVAILABLE"},{status:404});
    const results=await new PaymentService().reprocessStoredCheckoutEvents(sessionId,EVENT_IDS,await createClient());
    return Response.json({reprocessed:results},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"CHECKOUT_RECONCILIATION_FAILED";
    const forbidden=/FORBIDDEN|SESSION_NOT_FOUND/.test(message);
    return Response.json({error:forbidden?"PAYMENT_NOT_AVAILABLE":"CHECKOUT_RECONCILIATION_FAILED"},{status:forbidden?404:500});
  }
}