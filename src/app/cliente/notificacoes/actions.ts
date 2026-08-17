"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PreferenceActionState={success?:string;error?:string;minutes?:number};

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

export async function saveTariffAlertPreference(_:PreferenceActionState,form: FormData):Promise<PreferenceActionState> {
  const minutes=Number(form.get("tariffAlertMinutes"));
  if(![5,10,15].includes(minutes))return{error:"Escolha 5, 10 ou 15 minutos."};
  const supabase=await createClient();
  const{error}=await supabase.rpc("set_customer_tariff_alert_minutes",{target_minutes:minutes});
  if(error)return{error:"Não foi possível salvar sua preferência agora."};
  revalidatePath("/cliente/notificacoes");
  return{success:`Preferência salva: avisar ${minutes} minutos antes.`,minutes};
}
