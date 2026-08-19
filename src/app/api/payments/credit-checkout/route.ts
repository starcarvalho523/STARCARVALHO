import { createClient } from "@/lib/supabase/server";
import { PaymentService } from "@/lib/payments/payment-service";
import { paymentRouteFailure } from "@/lib/payments/payment-route-error";

export async function GET(request:Request){try{const sessionId=new URL(request.url).searchParams.get("sessionId");if(!sessionId)return Response.json({error:"SESSION_ID_REQUIRED"},{status:400});return Response.json({checkout:await new PaymentService().getCreditCheckout(sessionId,await createClient())},{headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}}
export async function POST(request:Request){try{const body=await request.json();const sessionId=typeof body?.sessionId==="string"?body.sessionId:"";if(!sessionId)return Response.json({error:"SESSION_ID_REQUIRED"},{status:400});return Response.json({checkout:await new PaymentService().createCreditCheckout(sessionId,await createClient(),new URL(request.url).origin)},{status:201,headers:{"cache-control":"no-store"}})}catch(error){return failure(error)}}
function failure(error:unknown){const result=paymentRouteFailure(error,"CHECKOUT_REQUEST_FAILED");return Response.json({error:result.error},{status:result.status})}
