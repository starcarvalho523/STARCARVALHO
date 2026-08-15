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
