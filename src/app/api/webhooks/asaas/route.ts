import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { PaymentService } from "@/lib/payments/payment-service";
import { safeTokenEquals } from "@/lib/payments/asaas-provider";
import { isAsaasPixAutomaticEvent } from "@/lib/payments/asaas-recurring-events";
import { processAsaasPixAutomaticWebhook } from "@/lib/payments/asaas-pix-automatic-webhook";
import { processAsaasPixAutomaticInitialPaymentWebhook } from "@/lib/payments/asaas-pix-automatic-initial-payment";

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
  const received = request.headers.get("asaas-access-token");
  let eventName = "";

  try {
    if (!safeTokenEquals(received, expected)) {
      console.warn("ASAAS_WEBHOOK_UNAUTHORIZED");
      return Response.json({ error: "INVALID_WEBHOOK" }, { status: 401 });
    }

    const provider = getPaymentProvider();
    const payload = await request.json();
    eventName = payload && typeof payload === "object" && "event" in payload ? String(payload.event) : "";

    if (!eventName) {
      console.warn("ASAAS_WEBHOOK_INVALID_EVENT");
      return Response.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
    }

    const relevantEvent =
      isAsaasPixAutomaticEvent(eventName) ||
      eventName.startsWith("CHECKOUT_") ||
      eventName.startsWith("PAYMENT_");

    if (!relevantEvent) {
      console.info("ASAAS_WEBHOOK_IGNORED", { eventName });
      return Response.json({ received: true, ignored: true }, { status: 200 });
    }

    const service = new PaymentService(provider);
    if (isAsaasPixAutomaticEvent(eventName)) {
      await processAsaasPixAutomaticWebhook(payload);
    } else if (eventName.startsWith("CHECKOUT_")) {
      await service.processCheckoutWebhook(provider.parseCheckoutWebhook(payload));
    } else {
      const initial = await processAsaasPixAutomaticInitialPaymentWebhook(payload, provider.environment);
      if (!initial.handled) await service.processWebhook(provider.parseWebhook(payload));
    }

    return Response.json({ received: true }, { status: 200 });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const invalid =
      error instanceof Error &&
      (error.message === "INVALID_ASAAS_WEBHOOK" ||
        error.message.startsWith("ASAAS_PIX_AUTOMATIC_INVALID_") ||
        error.message.includes("EVENT_ID_REQUIRED"));

    console.warn("ASAAS_WEBHOOK_PROCESSING_ERROR", {
      eventName,
      errorCode: errorCode.slice(0, 120),
      status: invalid ? 400 : 500,
    });

    return Response.json(
      { error: invalid ? "INVALID_WEBHOOK" : "WEBHOOK_PROCESSING_FAILED" },
      { status: invalid ? 400 : 500 },
    );
  }
}
