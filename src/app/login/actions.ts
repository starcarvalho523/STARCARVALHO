"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";

export type LoginState = { error: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6) return { error: "Informe um e-mail válido e uma senha com pelo menos 6 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "E-mail ou senha incorretos. Verifique os dados e tente novamente." };

  const access = await getAccess();
  if (!access) {
    await supabase.auth.signOut();
    return { error: "Sua conta ainda não possui um perfil de acesso. Solicite a liberação ao administrador." };
  }
  redirect(`/${access.area}`);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
