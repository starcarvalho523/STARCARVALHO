import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAsaasPixAutomaticWebhook } from "./asaas-pix-automatic-contract";

export async function processAsaasPixAutomaticWebhook(payload: unknown) {
  const event = parseAsaasPixAutomaticWebhook(payload);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_monthly_recurring_provider_event", {
    event_id: event.id,
    event_type: event.event,
    authorization_id: event.authorizationId,
    subscription_provider_id: event.subscriptionId,
    authorization_state: event.status,
    provider_event_at: event.occurredAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(`ASAAS_PIX_AUTOMATIC_WEBHOOK_RPC_${error.message}`);
  return data;
}
