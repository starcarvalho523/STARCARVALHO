"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
export type RecoveryState = { message?: string; error?: string };
async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.VERCEL_ENV === "production") throw new Error("SITE_URL_NOT_CONFIGURED");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") === "https" ? "https" : "http";
  const host = h.get("host") ?? "localhost:3000";
  return new URL(`${proto}://${host}`).origin;
}
export async function recover(_: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase(); if (!email.includes("@")) return { error: "Informe um e-mail válido." };
  const origin = await siteOrigin();
  const supabase = await createClient(); await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha` });
  return { message: "Se existir uma conta para este e-mail, enviaremos as instruções de recuperação." };
}
