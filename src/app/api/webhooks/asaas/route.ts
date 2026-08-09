import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { PaymentService } from "@/lib/payments/payment-service";
import { safeTokenEquals } from "@/lib/payments/asaas-provider";

export async function POST(request:Request){
  const expected=process.env.ASAAS_WEBHOOK_TOKEN??"";
  try{
    if(!safeTokenEquals(request.headers.get("asaas-access-token"),expected))return Response.json({error:"INVALID_WEBHOOK"},{status:401});
    const provider=getPaymentProvider();
    const event=provider.parseWebhook(await request.json());
    await new PaymentService(provider).processWebhook(event);
    return Response.json({received:true},{status:200});
  }catch(error){
    const invalid=error instanceof Error&&error.message==="INVALID_ASAAS_WEBHOOK";
    return Response.json({error:invalid?"INVALID_WEBHOOK":"WEBHOOK_PROCESSING_FAILED"},{status:invalid?400:500});
  }
}
