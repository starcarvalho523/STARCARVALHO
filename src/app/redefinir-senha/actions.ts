"use server";
import { redirect } from "next/navigation"; import { createClient } from "@/lib/supabase/server";
export type ResetState = { error?: string };
export async function reset(_: ResetState, formData: FormData): Promise<ResetState> { const password = String(formData.get("password") ?? ""); const confirm = String(formData.get("confirm") ?? ""); if (password.length < 8) return { error: "Use pelo menos 8 caracteres." }; if (password !== confirm) return { error: "As senhas não coincidem." }; const supabase = await createClient(); const { error } = await supabase.auth.updateUser({ password }); if (error) return { error: "O link expirou. Solicite uma nova recuperação." }; redirect("/?senha=alterada"); }
