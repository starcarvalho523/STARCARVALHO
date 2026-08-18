import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AccessArea = "ceo" | "frentista" | "cliente";
export type EmployeeRole = "owner" | "manager" | "operator" | "finance" | "auditor";
export type Capability = "team:view" | "team:invite" | "team:disable" | "finance:view" | "audit:view";

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
  if (!access.roles.some((role) => CAPABILITIES[role]?.includes(capability))) {
    redirect("/ceo?erro=sem-permissao");
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
