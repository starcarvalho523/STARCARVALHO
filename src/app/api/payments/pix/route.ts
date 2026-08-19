import { createClient } from "@/lib/supabase/server";
import { PaymentService } from "@/lib/payments/payment-service";
import { paymentRouteFailure } from "@/lib/payments/payment-route-error";

export async function GET(request:Request){
  try{const sessionId=new URL(request.url).searchParams.get("sessionId");if(!sessionId)return Response.json({error:"SESSION_ID_REQUIRED"},{status:400});const data=await new PaymentService().getPix(sessionId,await createClient());return Response.json({payment:data},{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}
export async function POST(request:Request){
  try{const body=await request.json();const sessionId=typeof body?.sessionId==="string"?body.sessionId:"";if(!sessionId)return Response.json({error:"SESSION_ID_REQUIRED"},{status:400});const data=await new PaymentService().createPix(sessionId,await createClient());return Response.json({payment:data},{status:201,headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}
}
function failure(error:unknown){const result=paymentRouteFailure(error,"PAYMENT_REQUEST_FAILED");return Response.json({error:result.error},{status:result.status})}
