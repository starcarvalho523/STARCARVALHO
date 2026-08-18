"use server";

import { revalidatePath } from "next/cache";
import {
  canInvite,
  canManageEmployeeRole,
  requireCapability,
  type EmployeeRole,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type TeamState = { error?: string; success?: string };
const employeeRoles: EmployeeRole[] = ["operator", "manager", "finance", "auditor"];

function roleFrom(value: FormDataEntryValue | null): EmployeeRole | null {
  const role = String(value ?? "") as EmployeeRole;
  return employeeRoles.includes(role) ? role : null;
}

export async function inviteEmployee(_: TeamState, formData: FormData): Promise<TeamState> {
  const access = await requireCapability("team:invite");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "");
  const role = roleFrom(formData.get("role"));
  const actorUnitRoles = access.assignments
    .filter((assignment) => assignment.unit_id === unitId)
    .map((assignment) => assignment.role as EmployeeRole);

  if (!email.includes("@") || fullName.length < 2 || !unitId || !role) {
    return { error: "Revise os dados do convite." };
  }
  if (!canInvite(actorUnitRoles, role)) {
    return { error: "Você não pode atribuir essa função nesta unidade." };
  }

  try {
    const admin = createAdminClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName },
    });
    if (error || !data.user) {
      return { error: "Não foi possível enviar o convite. Verifique se o e-mail já possui conta." };
    }

    await admin.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      is_active: true,
    });

    const { error: roleError } = await admin.from("user_unit_roles").upsert(
      {
        user_id: data.user.id,
        unit_id: unitId,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
        disabled_at: null,
        disabled_by: null,
      },
      { onConflict: "user_id,unit_id,role" },
    );
    if (roleError) {
      return { error: "Convite enviado, mas o acesso precisa de revisão administrativa." };
    }

    await admin.from("employee_invitations").upsert(
      {
        email,
        full_name: fullName,
        unit_id: unitId,
        role,
        status: "pending",
        invited_by: access.user.id,
        auth_user_id: data.user.id,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "email,unit_id,role" },
    );

    await admin.from("audit_logs").insert({
      actor_user_id: access.user.id,
      unit_id: unitId,
      action: "employee.invited",
      target_user_id: data.user.id,
      metadata: { role, email },
    });

    revalidatePath("/ceo/equipe");
    return { success: "Convite enviado com segurança." };
  } catch {
    return { error: "A configuração administrativa do servidor ainda não está disponível." };
  }
}

export async function setEmployeeAccess(formData: FormData) {
  const access = await requireCapability("team:disable");
  const userId = String(formData.get("userId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const role = roleFrom(formData.get("role"));
  const enabled = String(formData.get("enabled") ?? "false") === "true";

  if (!userId || !unitId || !role || userId === access.user.id) return;

  const actorUnitRoles = access.assignments
    .filter((assignment) => assignment.unit_id === unitId)
    .map((assignment) => assignment.role as EmployeeRole);
  if (!canManageEmployeeRole(actorUnitRoles, role)) return;

  try {
    const admin = createAdminClient();
    const { data: target } = await admin
      .from("user_unit_roles")
      .select("user_id,unit_id,role,is_active")
      .eq("user_id", userId)
      .eq("unit_id", unitId)
      .eq("role", role)
      .maybeSingle();
    if (!target || target.role === "owner" || Boolean(target.is_active) === enabled) return;

    const now = new Date().toISOString();
    const { error } = await admin
      .from("user_unit_roles")
      .update({
        is_active: enabled,
        updated_at: now,
        disabled_at: enabled ? null : now,
        disabled_by: enabled ? null : access.user.id,
      })
      .eq("user_id", userId)
      .eq("unit_id", unitId)
      .eq("role", role);
    if (error) return;

    await admin.from("audit_logs").insert({
      actor_user_id: access.user.id,
      unit_id: unitId,
      action: enabled ? "employee.access_enabled" : "employee.access_disabled",
      target_user_id: userId,
      metadata: { role },
    });

    revalidatePath("/ceo/equipe");
  } catch {
    return;
  }
}
