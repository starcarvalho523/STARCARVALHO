import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AccessArea = "ceo" | "frentista" | "cliente";
export type EmployeeRole = "owner" | "manager" | "operator" | "finance" | "auditor";
export type Capability = "team:view" | "team:invite" | "team:disable" | "finance:view" | "audit:view";
export type CeoScope = "admin" | "finance" | "audit" | "any";

const CEO_ROLES: EmployeeRole[] = ["owner", "manager", "finance", "auditor"];
const CAPABILITIES: Record<EmployeeRole, Capability[]> = {
  owner: ["team:view", "team:invite", "team:disable", "finance:view", "audit:view"],
  manager: ["team:view", "team:invite", "team:disable"],
  operator: [],
  finance: ["finance:view"],
  auditor: ["audit:view"],
};

export function areaFromRoles(roles: string[], isCustomer = false): AccessArea | null {
  if (roles.some((role) => CEO_ROLES.includes(role as EmployeeRole))) return "ceo";
  if (roles.includes("operator")) return "frentista";
  return isCustomer ? "cliente" : null;
}

export function hasCapability(roles: EmployeeRole[], capability: Capability) {
  return roles.some((role) => CAPABILITIES[role]?.includes(capability));
}

export function canAccessCeoScope(roles: EmployeeRole[], scope: CeoScope) {
  if (scope === "any") return roles.some((role) => CEO_ROLES.includes(role));
  if (scope === "admin") return roles.some((role) => role === "owner" || role === "manager");
  if (scope === "finance") return hasCapability(roles, "finance:view");
  return hasCapability(roles, "audit:view");
}

export function ceoHomeForRoles(roles: EmployeeRole[]) {
  if (canAccessCeoScope(roles, "admin")) return "/ceo";
  if (canAccessCeoScope(roles, "finance")) return "/ceo/financeiro";
  if (canAccessCeoScope(roles, "audit")) return "/ceo/auditoria";
  return "/login?erro=sem-acesso";
}

export async function getAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: assignments }, { data: customer }] = await Promise.all([
    supabase.from("profiles").select("full_name,is_active").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_unit_roles")
      .select("role,unit_id,is_active")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("customer_profiles")
      .select("full_name,is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const roles = (assignments ?? []).map(({ role }) => role as EmployeeRole);
  const employeeArea = profile?.is_active ? areaFromRoles(roles) : null;
  const area = employeeArea ?? areaFromRoles([], Boolean(customer?.is_active));
  const selectedProfile = employeeArea ? profile : customer;
  if (!area || !selectedProfile) return null;

  return { user, profile: selectedProfile, roles, assignments: assignments ?? [], area };
}

export async function requireArea(expected: AccessArea) {
  const access = await getAccess();
  if (!access) redirect("/login?erro=sem-acesso");
  if (access.area !== expected) redirect(`/${access.area}`);
  return access;
}

export async function requireCapability(capability: Capability) {
  const access = await requireArea("ceo");
  if (!hasCapability(access.roles, capability)) {
    redirect(`${ceoHomeForRoles(access.roles)}?erro=sem-permissao`);
  }
  return access;
}

export async function requireCeoScope(scope: CeoScope) {
  const access = await requireArea("ceo");
  if (!canAccessCeoScope(access.roles, scope)) {
    redirect(`${ceoHomeForRoles(access.roles)}?erro=sem-permissao`);
  }
  return access;
}

export function canInvite(actorRoles: EmployeeRole[], target: EmployeeRole) {
  if (target === "owner") return false;
  if (actorRoles.includes("owner")) return true;
  return actorRoles.includes("manager") && target === "operator";
}

export function canManageEmployeeRole(actorRoles: EmployeeRole[], target: EmployeeRole) {
  if (target === "owner") return false;
  if (actorRoles.includes("owner")) return true;
  return actorRoles.includes("manager") && target === "operator";
}
