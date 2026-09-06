export type CapacityUnit = { id: string; capacity: number | null };
export type ZoneRow = { unit_id: string; capacity: number; is_active: boolean; zone_type: string };
export type SessionRow = { unit_id: string; status: string; entered_at: string; exited_at: string | null; entry_mode: string };
export type PaymentRow = { unit_id: string; status: string; amount: number | string; paid_at: string | null };
export type SubscriptionRow = { unit_id: string; status: string; contracted_price: number | string | null };
export type DemandRow = { unit_id: string; reason: string; occurred_at: string };
export type BusinessContractRow = { unit_id: string; status: string; price: number | string };

export function commercialSummary(input: {
  units: CapacityUnit[];
  zones: ZoneRow[];
  sessions: SessionRow[];
  payments: PaymentRow[];
  subscriptions: SubscriptionRow[];
  demand: DemandRow[];
  businessContracts: BusinessContractRow[];
  days: number;
}) {
  const days = Math.max(1, input.days);
  const totalCapacity = input.units.reduce((sum, row) => sum + Number(row.capacity ?? 0), 0);
  const allocatedZoneCapacity = input.zones.filter((row) => row.is_active).reduce((sum, row) => sum + Number(row.capacity), 0);
  const openSessions = input.sessions.filter((row) => ["OPEN", "PAYMENT_PENDING", "PAID", "MANUAL_REVIEW"].includes(row.status)).length;
  const paidRevenue = input.payments.filter((row) => row.status === "PAID").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const activeSubscriptions = input.subscriptions.filter((row) => row.status === "ACTIVE");
  const monthlyMrr = activeSubscriptions.reduce((sum, row) => sum + Number(row.contracted_price ?? 0), 0);
  const activeBusiness = input.businessContracts.filter((row) => row.status === "ACTIVE");
  const businessMrr = activeBusiness.reduce((sum, row) => sum + Number(row.price ?? 0), 0);
  const lostDemand = input.demand.length;
  const fullDemand = input.demand.filter((row) => row.reason === "FULL").length;
  const occupancy = totalCapacity ? (openSessions / totalCapacity) * 100 : 0;
  const revpas = totalCapacity ? paidRevenue / totalCapacity / days : 0;
  const recurringMrr = monthlyMrr + businessMrr;
  const monthlyEntries = input.sessions.filter((row) => row.entry_mode.startsWith("MONTHLY")).length;
  const casualEntries = input.sessions.filter((row) => row.entry_mode === "CASUAL").length;
  const knownEntries = monthlyEntries + casualEntries;

  let expansionStatus: "NORMAL" | "WATCH" | "STUDY_EXPANSION" = "NORMAL";
  if (occupancy >= 85 || fullDemand >= 20) expansionStatus = "STUDY_EXPANSION";
  else if (occupancy >= 70 || fullDemand >= 5) expansionStatus = "WATCH";

  return {
    totalCapacity,
    allocatedZoneCapacity,
    unallocatedCapacity: Math.max(0, totalCapacity - allocatedZoneCapacity),
    openSessions,
    occupancy,
    paidRevenue,
    revpas,
    monthlyMrr,
    businessMrr,
    recurringMrr,
    activeMonthlyContracts: activeSubscriptions.length,
    activeBusinessContracts: activeBusiness.length,
    lostDemand,
    fullDemand,
    monthlyShare: knownEntries ? (monthlyEntries / knownEntries) * 100 : 0,
    casualShare: knownEntries ? (casualEntries / knownEntries) * 100 : 0,
    expansionStatus,
  };
}
