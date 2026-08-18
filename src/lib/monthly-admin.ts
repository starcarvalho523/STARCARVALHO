import "server-only";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getMonthlyAccess() {
  const access = await requireArea("ceo");
  const unitIds = [...new Set(access.assignments.map((item) => item.unit_id as string))];
  const manageableUnitIds = [
    ...new Set(
      access.assignments
        .filter((item) => item.role === "owner" || item.role === "manager")
        .map((item) => item.unit_id as string),
    ),
  ];
  return { access, unitIds, manageableUnitIds, canManage: manageableUnitIds.length > 0 };
}

export async function requireMonthlyUnit(unitId: string, write = false) {
  const context = await getMonthlyAccess();
  const allowed = write ? context.manageableUnitIds : context.unitIds;
  if (!allowed.includes(unitId)) throw new Error("MONTHLY_FORBIDDEN");
  return context;
}

export async function getScopedCustomers(unitIds: string[]) {
  if (!unitIds.length) return [];
  const admin = createAdminClient();
  const [{ data: sessions }, { data: subscriptions }] = await Promise.all([
    admin.from("parking_sessions").select("vehicle_id").in("unit_id", unitIds),
    admin
      .from("monthly_subscriptions")
      .select("customer_id")
      .in("unit_id", unitIds)
      .not("customer_id", "is", null),
  ]);
  const vehicleIds = [...new Set((sessions ?? []).map((row) => row.vehicle_id as string))];
  const { data: vehicles } = vehicleIds.length
    ? await admin
        .from("vehicles")
        .select("id,customer_id,normalized_plate,vehicle_type")
        .in("id", vehicleIds)
        .not("customer_id", "is", null)
    : { data: [] };
  const customerIds = [
    ...new Set([
      ...(subscriptions ?? []).map((row) => row.customer_id as string),
      ...(vehicles ?? []).map((row) => row.customer_id as string),
    ]),
  ];
  const { data: customers } = customerIds.length
    ? await admin
        .from("customer_profiles")
        .select("user_id,full_name,is_active")
        .in("user_id", customerIds)
        .eq("is_active", true)
        .order("full_name")
    : { data: [] };
  return (customers ?? []).map((customer) => ({
    ...customer,
    vehicles: (vehicles ?? []).filter((vehicle) => vehicle.customer_id === customer.user_id),
  }));
}

export async function getSubscriptionOr404(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("monthly_subscriptions").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  await requireMonthlyUnit(data.unit_id);
  return data;
}

export const money = (value: number | string | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0),
  );

export const dateBR = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value.slice(0, 10)}T12:00:00Z`),
      )
    : "—";

export const monthlyStatus: Record<string, string> = {
  PENDING_ACTIVATION: "Aguardando ativação",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  ENDED: "Encerrada",
  PENDING: "Pendente",
  PAID: "Paga",
  WAIVED: "Dispensada",
  MANUAL_REVIEW: "Revisão manual",
  OVERDUE: "Em atraso",
};
