import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const unitId = typeof body?.unitId === "string" ? body.unitId : "";
    const dryRun = body?.dryRun === true;
    if (!unitId) return Response.json({ error: "UNIT_ID_REQUIRED" }, { status: 400 });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("run_monthly_billing_generation", { target_unit: unitId, dry_run: dryRun });
    if (error) throw error;
    return Response.json({ result: data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MONTHLY_AUTOMATION_FAILED";
    return Response.json({ error: message.includes("FORBIDDEN") ? "MONTHLY_FORBIDDEN" : "MONTHLY_AUTOMATION_FAILED" }, { status: message.includes("FORBIDDEN") ? 403 : 400 });
  }
}
