"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export type SignupState = { error?: string; success?: string };
async function siteOrigin() { const h = await headers(); return process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`; }
export async function signup(_: SignupState, formData: FormData): Promise<SignupState> {
  const fullName = String(formData.get("fullName") ?? "").trim(); const email = String(formData.get("email") ?? "").trim().toLowerCase(); const password = String(formData.get("password") ?? ""); const confirm = String(formData.get("confirm") ?? "");
  if (fullName.length < 2 || !email.includes("@") || password.length < 8) return { error: "Preencha nome, e-mail válido e senha com pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As senhas não coincidem." };
  const supabase = await createClient(); const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return { error: "Não foi possível criar a conta. Confira os dados e tente novamente." };
  if (data.session && data.user) { await supabase.from("customer_profiles").upsert({ user_id: data.user.id, full_name: fullName }); redirect("/cliente"); }
  return { success: "Conta criada. Confira seu e-mail para confirmar o cadastro." };
}
export async function signInWithGoogle() {
  const supabase = await createClient(); const origin = await siteOrigin(); const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin}/auth/callback` } });
  if (error || !data.url) redirect("/cadastro?erro=google"); redirect(data.url);
}
