export type CapacityUnit = { id: string; capacity: number | null; area_sqm?: number | string | null; monthly_fixed_cost?: number | string | null };
export type ZoneRow = { unit_id: string; capacity: number; is_active: boolean; zone_type: string };
export type SessionRow = { unit_id: string; status: string; entered_at: string; exited_at: string | null; entry_mode: string };
export type PaymentRow = { unit_id: string; status: string; amount: number | string; paid_at: string | null };
export type SubscriptionRow = { unit_id: string; status: string; contracted_price: number | string | null };
export type DemandRow = { unit_id: string; reason: string; occurred_at: string };
export type BusinessContractRow = { unit_id: string; status: string; price: number | string };
export type MarketingSpendRow = { unit_id: string; amount: number | string };
export type AcquisitionRow = { unit_id: string; customer_id: string; first_touch_at?: string | null };

export function commercialSummary(input: {
  units: CapacityUnit[];
  zones: ZoneRow[];
  sessions: SessionRow[];
  payments: PaymentRow[];
  subscriptions: SubscriptionRow[];
  demand: DemandRow[];
  businessContracts: BusinessContractRow[];
  marketingSpend?: MarketingSpendRow[];
  acquisitions?: AcquisitionRow[];
  days: number;
}) {
  const days = Math.max(1, input.days);
  const totalCapacity = input.units.reduce((sum, row) => sum + Number(row.capacity ?? 0), 0);
  const totalAreaSqm = input.units.reduce((sum,row)=>sum+Number(row.area_sqm ?? 0),0);
  const monthlyFixedCost = input.units.reduce((sum,row)=>sum+Number(row.monthly_fixed_cost ?? 0),0);
  const allocatedZoneCapacity = input.zones.filter((row) => row.is_active).reduce((sum, row) => sum + Number(row.capacity), 0);
  const openSessions = input.sessions.filter((row) => ["OPEN", "PAYMENT_PENDING", "PAID", "MANUAL_REVIEW"].includes(row.status)).length;
  const paidRevenue = input.payments.filter((row) => row.status === "PAID").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const activeSubscriptions = input.subscriptions.filter((row) => row.status === "ACTIVE");
  const monthlyMrr = activeSubscriptions.reduce((sum, row) => sum + Number(row.contracted_price ?? 0), 0);
  const activeBusiness = input.businessContracts.filter((row) => row.status === "ACTIVE");
  const businessMrr = activeBusiness.reduce((sum, row) => sum + Number(row.price ?? 0), 0);
  const marketingSpend = (input.marketingSpend ?? []).reduce((sum,row)=>sum+Number(row.amount ?? 0),0);
  const acquiredCustomers = new Set((input.acquisitions ?? []).map((row)=>`${row.unit_id}:${row.customer_id}`)).size;
  const lostDemand = input.demand.length;
  const fullDemand = input.demand.filter((row) => row.reason === "FULL").length;
  const occupancy = totalCapacity ? (openSessions / totalCapacity) * 100 : 0;
  const revpas = totalCapacity ? paidRevenue / totalCapacity / days : 0;
  const recurringMrr = monthlyMrr + businessMrr;
  const monthlyEntries = input.sessions.filter((row) => row.entry_mode.startsWith("MONTHLY")).length;
  const businessEntries = input.sessions.filter((row) => row.entry_mode === "BUSINESS").length;
  const casualEntries = input.sessions.filter((row) => row.entry_mode === "CASUAL").length;
  const knownEntries = monthlyEntries + businessEntries + casualEntries;

  let expansionStatus: "NORMAL" | "WATCH" | "STUDY_EXPANSION" = "NORMAL";
  if (occupancy >= 85 || fullDemand >= 20) expansionStatus = "STUDY_EXPANSION";
  else if (occupancy >= 70 || fullDemand >= 5) expansionStatus = "WATCH";

  return {
    totalCapacity,
    totalAreaSqm,
    monthlyFixedCost,
    fixedCostPerSpace: totalCapacity ? monthlyFixedCost / totalCapacity : 0,
    revenuePerSqm: totalAreaSqm ? paidRevenue / totalAreaSqm : 0,
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
    marketingSpend,
    acquiredCustomers,
    cac: acquiredCustomers ? marketingSpend / acquiredCustomers : 0,
    lostDemand,
    fullDemand,
    monthlyShare: knownEntries ? (monthlyEntries / knownEntries) * 100 : 0,
    businessShare: knownEntries ? (businessEntries / knownEntries) * 100 : 0,
    casualShare: knownEntries ? (casualEntries / knownEntries) * 100 : 0,
    expansionStatus,
  };
}
