import "server-only";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export { formatDateTime, formatDuration, formatMoney, type ActiveSession } from "@/lib/operator-format";
import type { ActiveSession } from "@/lib/operator-format";

export type DashboardSummary = { unit:{id:string;name:string;slug:string;capacity:number;timezone:string}; vehicles_in_yard:number; available_spaces:number; entries_today:number; exits_today:number; active_sessions:ActiveSession[]; open_shift:null|{id:string;opened_at:string;opening_amount:number;cash_total:number;card_total:number;pix_total:number;payment_count:number}; has_active_car_tariff:boolean; has_active_motorcycle_tariff:boolean };

export async function getOperatorContext() {
  const access = await requireArea("frentista");
  const assignment = access.assignments.find((item) => item.role === "operator");
  if (!assignment) throw new Error("OPERATOR_UNIT_NOT_FOUND");
  return { access, unitId: assignment.unit_id as string };
}
export async function getOperatorDashboard(): Promise<DashboardSummary> {
  const { unitId } = await getOperatorContext(); const supabase = await createClient();
  const { data, error } = await supabase.rpc("operator_dashboard_summary", { target_unit: unitId });
  if (error || !data) throw new Error("OPERATOR_DASHBOARD_UNAVAILABLE");
  return data as DashboardSummary;
}
