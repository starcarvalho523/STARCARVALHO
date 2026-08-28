import { createAdminClient } from "@/lib/supabase/admin";
import { runMonthlyPixAutomaticRecurringBilling } from "@/lib/payments/monthly-pix-automatic-recurring-billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  // The schedule is deliberately absent from vercel.json until post-production approval.
  if (process.env.MONTHLY_BILLING_AUTOMATION_ENABLED !== "true") {
    return Response.json({ error: "MONTHLY_BILLING_AUTOMATION_DISABLED" }, { status: 503 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("run_monthly_billing_generation_cron", { dry_run: false });
    if (error) throw error;
    const pixAutomatic = await runMonthlyPixAutomaticRecurringBilling();
    return Response.json({ result: data, pixAutomatic }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "MONTHLY_BILLING_AUTOMATION_FAILED" }, { status: 500 });
  }
}
