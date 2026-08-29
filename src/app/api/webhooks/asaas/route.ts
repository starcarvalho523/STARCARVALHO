import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { PaymentService } from "@/lib/payments/payment-service";
import { safeTokenEquals } from "@/lib/payments/asaas-provider";
import { isAsaasPixAutomaticEvent } from "@/lib/payments/asaas-recurring-events";
import { processAsaasPixAutomaticWebhook } from "@/lib/payments/asaas-pix-automatic-webhook";
import { processAsaasPixAutomaticInitialPaymentWebhook } from "@/lib/payments/asaas-pix-automatic-initial-payment";

function safeWebhookErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN_PROCESSING_ERROR";
  if (error.message === "INVALID_ASAAS_WEBHOOK") return "INVALID_ASAAS_WEBHOOK";
  if (error.message.startsWith("ASAAS_PIX_AUTOMATIC_INVALID_")) {
    return error.message.split(":", 1)[0];
  }
  if (error.message.includes("EVENT_ID_REQUIRED")) return "EVENT_ID_REQUIRED";
  return "UNKNOWN_PROCESSING_ERROR";
}

export async function POST(request:Request){
  const expected=process.env.ASAAS_WEBHOOK_TOKEN??"";
  const received=request.headers.get("asaas-access-token");
  let eventName="";
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
    eventName=payload&&typeof payload==="object"&&"event" in payload?String(payload.event):"";
    const service=new PaymentService(provider);
    if(isAsaasPixAutomaticEvent(eventName))await processAsaasPixAutomaticWebhook(payload);
    else if(eventName.startsWith("CHECKOUT_"))await service.processCheckoutWebhook(provider.parseCheckoutWebhook(payload));
    else {
      const initial=await processAsaasPixAutomaticInitialPaymentWebhook(payload,provider.environment);
      if(!initial.handled)await service.processWebhook(provider.parseWebhook(payload));
    }
    return Response.json({received:true},{status:200});
  }catch(error){
    const errorCode=safeWebhookErrorCode(error);
    const invalid=errorCode!=="UNKNOWN_PROCESSING_ERROR";
    console.warn("ASAAS_WEBHOOK_PROCESSING_REJECTED",{
      eventName:eventName||"MISSING_EVENT",
      errorCode,
      status:invalid?400:500,
    });
    return Response.json({error:invalid?"INVALID_WEBHOOK":"WEBHOOK_PROCESSING_FAILED"},{status:invalid?400:500});
  }
}
