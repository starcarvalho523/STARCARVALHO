import { createAdminClient } from "@/lib/supabase/admin";
import { runMonthlyPixAutomaticRecurringBilling } from "@/lib/payments/monthly-pix-automatic-recurring-billing";
import { runMonthlyAsaasReconciliation } from "@/lib/payments/monthly-asaas-reconciliation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (process.env.MONTHLY_BILLING_AUTOMATION_ENABLED !== "true") {
    return Response.json(
      { ok: true, skipped: true, reason: "MONTHLY_BILLING_AUTOMATION_DISABLED" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const admin = createAdminClient();
    const { data: generation, error: generationError } = await admin.rpc(
      "run_monthly_billing_generation_cron",
      { dry_run: false },
    );
    if (generationError) throw generationError;

    const pixAutomatic = await runMonthlyPixAutomaticRecurringBilling();
    const reconciliation = await runMonthlyAsaasReconciliation();

    const { data: notifications, error: notificationError } = await admin.rpc(
      "run_monthly_customer_notifications_cron",
    );
    if (notificationError) throw notificationError;

    const { data: statusAutomation, error: statusError } = await admin.rpc(
      "run_monthly_subscription_status_automation_cron",
    );
    if (statusError) throw statusError;

    return Response.json(
      { ok: true, generation, pixAutomatic, reconciliation, notifications, statusAutomation },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("MONTHLY_BILLING_AUTOMATION_FAILED", publicFailure(error));
    return Response.json({ error: "MONTHLY_BILLING_AUTOMATION_FAILED" }, { status: 500 });
  }
}

function publicFailure(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  return error.message
    .replace(/(access[_-]?token|api[_-]?key|authorization|secret)\s*[:=]\s*\S+/gi, "[redacted]")
    .slice(0, 160);
}
