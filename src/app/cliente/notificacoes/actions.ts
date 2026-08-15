"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function markNotificationRead(form: FormData) {
  const supabase = await createClient();
  await supabase.rpc("mark_customer_notification_read", {
    notification_id: String(form.get("notificationId") ?? ""),
  });
  revalidatePath("/cliente/notificacoes");
}
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  await supabase.rpc("mark_all_customer_notifications_read");
  revalidatePath("/cliente/notificacoes");
}
export async function saveTariffAlertPreference(form: FormData) {
  const minutes=Number(form.get("tariffAlertMinutes"));
  if(![5,10,15].includes(minutes))return;
  const supabase=await createClient();
  await supabase.rpc("set_customer_tariff_alert_minutes",{target_minutes:minutes});
  revalidatePath("/cliente/notificacoes");
}
