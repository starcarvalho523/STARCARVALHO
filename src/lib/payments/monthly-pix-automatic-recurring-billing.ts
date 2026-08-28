import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAsaasRuntimeConfig } from "./asaas-config";
import { createAsaasPixAutomaticCharge, isAsaasPixAutomaticEnabled } from "./asaas-pix-automatic-client";
import { getPaymentProvider } from "./provider-factory";

type Candidate = { billing_period_id: string; due_date: string };
type Reservation = {
  paymentId?: string;
  transactionId?: string;
  state?: string;
  amount?: number;
  dueDate?: string;
  providerCustomerId?: string;
  providerAuthorizationId?: string;
  externalReference?: string;
  providerPaymentId?: string | null;
  isCreator?: boolean;
};

export async function runMonthlyPixAutomaticRecurringBilling() {
  if (!isAsaasPixAutomaticEnabled()) return { enabled:false, prepared:0, candidates:0, created:0, recovered:0, existing:0, failed:0 };

  const admin = createAdminClient();
  const config = resolveAsaasRuntimeConfig();
  const provider = getPaymentProvider();
  const { data: preparedData, error: prepareError } = await admin.rpc("prepare_monthly_pix_automatic_due_periods");
  if (prepareError) throw new Error(prepareError.message);
  const prepared = readCount(preparedData, "created");

  const { data: candidateData, error: candidateError } = await admin.rpc("list_monthly_pix_automatic_due_charges");
  if (candidateError) throw new Error(candidateError.message);
  const candidates = (Array.isArray(candidateData) ? candidateData : []) as Candidate[];
  let created=0,recovered=0,existing=0,failed=0;

  for (const candidate of candidates) {
    try {
      const { data: reservationData, error: reservationError } = await admin.rpc("reserve_monthly_pix_automatic_charge", {
        target_period: candidate.billing_period_id,
        target_environment: config.providerEnvironment,
        request_key: crypto.randomUUID(),
      });
      if (reservationError) throw new Error(reservationError.message);
      const reservation = reservationData as Reservation;
      if (reservation.providerPaymentId) { existing++; continue; }
      const transactionId = requiredString(reservation.transactionId,"MONTHLY_PIX_AUTOMATIC_TRANSACTION_REQUIRED");
      const customerId = requiredString(reservation.providerCustomerId,"MONTHLY_PIX_AUTOMATIC_CUSTOMER_REQUIRED");
      const authorizationId = requiredString(reservation.providerAuthorizationId,"MONTHLY_PIX_AUTOMATIC_AUTHORIZATION_REQUIRED");
      const externalReference = requiredString(reservation.externalReference,"MONTHLY_PIX_AUTOMATIC_EXTERNAL_REFERENCE_REQUIRED");
      const dueDate = requiredString(reservation.dueDate,"MONTHLY_PIX_AUTOMATIC_DUE_DATE_REQUIRED");
      const amount = Number(reservation.amount);
      if (!Number.isFinite(amount) || amount<=0) throw new Error("MONTHLY_PIX_AUTOMATIC_AMOUNT_INVALID");

      let charge = await provider.findPaymentByExternalReference(externalReference);
      let wasRecovered = Boolean(charge);
      if (charge) {
        if (charge.providerCustomerId!==customerId || charge.externalReference!==externalReference || charge.billingType!=="PIX" || Math.abs(Number(charge.amount)-amount)>0.0001) {
          throw new Error("MONTHLY_PIX_AUTOMATIC_RECOVERY_MISMATCH");
        }
      } else {
        const createdCharge = await createAsaasPixAutomaticCharge({
          customerId,authorizationId,amount,dueDate,
          description:"Mensalidade Star Carvalhos",
          externalReference,
        });
        if (createdCharge.customerId!==customerId || createdCharge.externalReference!==externalReference) throw new Error("MONTHLY_PIX_AUTOMATIC_CREATE_MISMATCH");
        charge = {
          providerPaymentId:createdCharge.id,
          providerCustomerId:createdCharge.customerId,
          providerStatus:createdCharge.status,
          billingType:"PIX",
          amount:createdCharge.amount,
          externalReference:createdCharge.externalReference,
          hostedPaymentUrl:null,qrCodePayload:null,qrCodeImageBase64:null,expiresAt:null,
        };
      }

      const { error: markError } = await admin.rpc("mark_monthly_pix_automatic_charge_created", {
        target_transaction: transactionId,
        target_provider_payment_id: charge.providerPaymentId,
        target_provider_customer_id: charge.providerCustomerId,
        target_provider_status: charge.providerStatus,
        target_reported_amount: charge.amount,
        target_external_reference: externalReference,
      });
      if (markError) throw new Error(markError.message);
      if (wasRecovered) recovered++; else created++;
    } catch (error) {
      failed++;
      console.error("MONTHLY_PIX_AUTOMATIC_CHARGE_FAILED", publicFailure(error));
    }
  }

  return { enabled:true, prepared, candidates:candidates.length, created, recovered, existing, failed };
}

function requiredString(value: unknown, code: string) {
  if (typeof value!=="string" || !value.trim()) throw new Error(code);
  return value;
}
function readCount(value: unknown, key: string) {
  if (!value || typeof value!=="object") return 0;
  const raw=(value as Record<string,unknown>)[key];
  const number=typeof raw==="number"?raw:Number(raw);
  return Number.isFinite(number)?number:0;
}
function publicFailure(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  return error.message.replace(/(access[_-]?token|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,"[redacted]").slice(0,160);
}
