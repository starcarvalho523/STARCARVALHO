"use server";
import { revalidatePath } from "next/cache";
import { canInvite, requireCapability, type EmployeeRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
export type TeamState = { error?: string; success?: string };
const allowed: EmployeeRole[] = ["operator"];
export async function inviteEmployee(_: TeamState, formData: FormData): Promise<TeamState> {
  const access = await requireCapability("team:invite");
  const email = String(formData.get("email") ?? "").trim().toLowerCase(); const fullName = String(formData.get("fullName") ?? "").trim(); const unitId = String(formData.get("unitId") ?? ""); const role = String(formData.get("role") ?? "") as EmployeeRole;
  if (!email.includes("@") || fullName.length < 2 || !unitId || !allowed.includes(role) || !canInvite(access.roles, role)) return { error: "Dados ou permissão inválidos para este convite." };
  if (!access.assignments.some(a => a.unit_id === unitId && ["owner","manager"].includes(String(a.role)))) return { error: "Você não administra esta unidade." };
  try {
    const admin = createAdminClient(); const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName } }); if (error || !data.user) return { error: "Não foi possível enviar o convite. Verifique se o e-mail já existe." };
    await admin.from("profiles").upsert({ id: data.user.id, full_name: fullName, is_active: true });
    const { error: roleError } = await admin.from("user_unit_roles").upsert({ user_id: data.user.id, unit_id: unitId, role }); if (roleError) return { error: "Convite enviado, mas o perfil precisa de revisão administrativa." };
    await admin.from("employee_invitations").upsert({ email, full_name: fullName, unit_id: unitId, role, invited_by: access.user.id, auth_user_id: data.user.id });
    await admin.from("audit_logs").insert({ actor_user_id: access.user.id, unit_id: unitId, action: "employee.invited", target_user_id: data.user.id, metadata: { role, email } });
    revalidatePath("/ceo/equipe"); return { success: "Convite enviado com segurança." };
  } catch { return { error: "A chave secreta do servidor ainda não foi configurada." }; }
}
export async function disableEmployee(formData: FormData) {
  const access = await requireCapability("team:disable"); const userId = String(formData.get("userId") ?? ""); const unitId = String(formData.get("unitId") ?? "");
  if (!userId || userId === access.user.id || !access.assignments.some(a => a.unit_id === unitId && ["owner","manager"].includes(String(a.role)))) return;
  try { const admin = createAdminClient(); await admin.from("profiles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", userId); await admin.from("audit_logs").insert({ actor_user_id: access.user.id, unit_id: unitId, action: "employee.disabled", target_user_id: userId }); revalidatePath("/ceo/equipe"); } catch { return; }
}

