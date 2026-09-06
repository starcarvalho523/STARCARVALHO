"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function recordFullDemand(formData: FormData) {
  const unitId = String(formData.get("unitId") ?? "");
  const vehicleType = String(formData.get("vehicleType") ?? "CAR");
  if (!unitId || !["CAR","MOTORCYCLE"].includes(vehicleType)) return;
  const supabase = await createClient();
  await supabase.rpc("record_parking_demand_loss", {
    target_unit: unitId,
    target_reason: "FULL",
    target_vehicle_type: vehicleType,
    target_notes: null,
  });
  revalidatePath("/frentista");
}
