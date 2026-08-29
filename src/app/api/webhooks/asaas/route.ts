import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { PaymentService } from "@/lib/payments/payment-service";
import { safeTokenEquals } from "@/lib/payments/asaas-provider";
import { isAsaasPixAutomaticEvent } from "@/lib/payments/asaas-recurring-events";
import { processAsaasPixAutomaticWebhook } from "@/lib/payments/asaas-pix-automatic-webhook";
import { processAsaasPixAutomaticInitialPaymentWebhook } from "@/lib/payments/asaas-pix-automatic-initial-payment";

export async function POST(request:Request){
  const expected=process.env.ASAAS_WEBHOOK_TOKEN??"";
  const received=request.headers.get("asaas-access-token");
  try{
    if(!safeTokenEquals(received,expected)){
      console.warn("ASAAS_WEBHOOK_TOKEN_MISMATCH",{
        receivedPresent:Boolean(received),
        receivedLength:received?.length??0,
        expectedConfigured:Boolean(expected),
        expectedLength:expected.length,
        sameLength:Boolean(received)&&received!.length===expected.length,
      });
      return Response.json({error:"INVALID_WEBHOOK"},{status:401});
    }
    const provider=getPaymentProvider();
    const payload=await request.json();
    const eventName=payload&&typeof payload==="object"&&"event" in payload?String(payload.event):"";
    const service=new PaymentService(provider);
    if(isAsaasPixAutomaticEvent(eventName))await processAsaasPixAutomaticWebhook(payload);
    else if(eventName.startsWith("CHECKOUT_"))await service.processCheckoutWebhook(provider.parseCheckoutWebhook(payload));
    else {
      const initial=await processAsaasPixAutomaticInitialPaymentWebhook(payload,provider.environment);
      if(!initial.handled)await service.processWebhook(provider.parseWebhook(payload));
    }
    return Response.json({received:true},{status:200});
  }catch(error){
    const invalid=error instanceof Error&&(error.message==="INVALID_ASAAS_WEBHOOK"||error.message.startsWith("ASAAS_PIX_AUTOMATIC_INVALID_")||error.message.includes("EVENT_ID_REQUIRED"));
    return Response.json({error:invalid?"INVALID_WEBHOOK":"WEBHOOK_PROCESSING_FAILED"},{status:invalid?400:500});
  }
}
