"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
export type RecoveryState = { message?: string; error?: string };
export async function recover(_: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase(); if (!email.includes("@")) return { error: "Informe um e-mail válido." };
  const h = await headers(); const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const supabase = await createClient(); await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha` });
  return { message: "Se existir uma conta para este e-mail, enviaremos as instruções de recuperação." };
}
