import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentService } from "./payment-service";
import { getPaymentProvider } from "./provider-factory";

type Candidate = {
  payment_id: string;
  unit_id: string;
  provider_payment_id: string;
  provider_status: string | null;
  amount: number | string;
  external_reference: string | null;
};

export async function runMonthlyAsaasReconciliation() {
  const admin = createAdminClient();
  const provider = getPaymentProvider();
  const service = new PaymentService(provider, admin);
  const { data, error } = await admin.rpc("list_monthly_asaas_reconciliation_candidates");
  if (error) throw new Error(error.message);
  const candidates = (Array.isArray(data) ? data : []) as Candidate[];

  let checked=0,processed=0,pending=0,failed=0;
  for (const candidate of candidates) {
    checked++;
    const incidentKey=`monthly-reconcile:${candidate.payment_id}`;
    try {
      const charge = await provider.getPayment(candidate.provider_payment_id);
      const eventType = reconciliationEventType(charge.providerStatus);
      if (!eventType) {
        pending++;
        await admin.rpc("resolve_monthly_automation_incident", { target_key:incidentKey });
        continue;
      }
      await service.processWebhook({
        id:`reconcile:${candidate.provider_payment_id}:${charge.providerStatus}`,
        type:eventType,
        paymentId:candidate.provider_payment_id,
        paymentStatus:charge.providerStatus,
        amount:Number(charge.amount),
        externalReference:charge.externalReference || candidate.external_reference,
        billingType:charge.billingType || "PIX",
        checkoutId:null,
        subscriptionId:null,
      });
      await admin.rpc("resolve_monthly_automation_incident", { target_key:incidentKey });
      processed++;
    } catch (error) {
      failed++;
      const message=publicFailure(error);
      console.error("MONTHLY_ASAAS_RECONCILIATION_FAILED", message);
      await admin.rpc("record_monthly_automation_incident", {
        target_unit:candidate.unit_id,
        target_key:incidentKey,
        target_code:"ASAAS_RECONCILIATION_FAILED",
        target_summary:`Falha ao reconciliar uma mensalidade com o Asaas: ${message}`,
        target_severity:"ATTENTION",
      });
    }
  }
  return { checked, processed, pending, failed };
}

function reconciliationEventType(status:string) {
  switch (status) {
    case "RECEIVED": return "PAYMENT_RECEIVED";
    case "OVERDUE": return "PAYMENT_OVERDUE";
    case "DELETED": return "PAYMENT_DELETED";
    case "REFUNDED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE": return "PAYMENT_UPDATED";
    default: return null;
  }
}

function publicFailure(error:unknown) {
  return error instanceof Error ? error.message.replace(/(access[_-]?token|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,"[redacted]").slice(0,160) : "UNKNOWN";
}
