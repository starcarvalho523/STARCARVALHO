import { createClient } from "@/lib/supabase/server";
import { PaymentService } from "@/lib/payments/payment-service";

const forbidden=new Set(["amount","paymentId","provider","cardNumber","pan","number","cvv","securityCode","customId","notificationUrl"]);
export async function POST(request:Request){
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body||Object.keys(body).some(k=>forbidden.has(k))||Object.keys(body).some(k=>!["sessionId","paymentToken","payer"].includes(k))||typeof body.sessionId!=="string"||typeof body.paymentToken!=="string")return Response.json({error:"EFI_CARD_INVALID_REQUEST"},{status:400});
 const user=await createClient();const {data:{user:actor}}=await user.auth.getUser();if(!actor)return Response.json({error:"UNAUTHORIZED"},{status:401});
 const {data:paymentId,error}=await user.rpc("get_or_reserve_efi_card_payment",{target_session:body.sessionId});if(error||typeof paymentId!=="string")return Response.json({error:"PAYMENT_FORBIDDEN"},{status:403});
 try{return Response.json({payment:await new PaymentService().createEfiCreditCardPayment(paymentId,body.paymentToken,body.payer)},{status:201});}catch{return Response.json({error:"EFI_CARD_CREATE_FAILED"},{status:502});}
}
