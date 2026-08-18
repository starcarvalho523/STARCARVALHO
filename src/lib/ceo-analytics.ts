import "server-only";
import { getCeoAnalytics as getRawCeoAnalytics, normalizeCeoFilters, type CeoFilters, type CeoPayment, type CeoPeriod, type CeoSession } from "@/lib/ceo-analytics-raw";
import { requireCeoScope, type CeoScope } from "@/lib/auth";
import { isOperationalFinancialPayment } from "@/lib/financial-environment";
import { previousRevenueTotal } from "@/lib/ceo-analytics-domain";

export { normalizeCeoFilters };
export type { CeoAlert, CeoFilters, CeoPayment, CeoPeriod, CeoSession, CeoShift, CeoUnit } from "@/lib/ceo-analytics-raw";

export async function getCeoAnalytics(filters: CeoFilters, scope: CeoScope = "admin") {
  await requireCeoScope(scope);
  const data = await getRawCeoAnalytics(filters);
  const payments = data.payments.filter(isOperationalFinancialPayment);
  const paid = data.paid.filter(isOperationalFinancialPayment);
  const previousRevenue = previousRevenueTotal(data.previousPayments, isOperationalFinancialPayment);
  const revenue = paid.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const method = (name: string) => {
    const rows = paid.filter((payment) => payment.method === name);
    const amount = rows.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return { amount, count: rows.length, percentage: revenue ? amount / revenue * 100 : 0 };
  };
  const unitSummaries = data.unitSummaries.map((unit) => ({ ...unit, revenue: paid.filter((payment) => payment.unit_id === unit.id).reduce((sum, payment) => sum + Number(payment.amount), 0) }));
  const buckets = makeBuckets(filters.period, new Date(data.periodStart), data.selectedUnits[0]?.timezone ?? data.units[0]?.timezone ?? "America/Bahia", paid, data.sessions, data.metrics.capacity);
  const casualRevenue = paid.filter((payment) => payment.payment_subject_type === "PARKING_SESSION").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const monthlyRevenue = paid.filter((payment) => payment.payment_subject_type === "MONTHLY_BILLING_PERIOD").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const alerts = data.alerts.map((alert) => ({ ...alert, href: normalizeAlertHref(alert.href) }));
  return { ...data, alerts, payments, paid, unitSummaries, buckets, metrics: { ...data.metrics, revenue, casualRevenue, monthlyRevenue, previousRevenue, ticket: paid.length ? revenue / paid.length : 0, payments: paid.length }, methods: { CASH: method("CASH"), CARD: method("CARD"), PIX: method("PIX"), DEBIT_CARD: method("DEBIT_CARD"), CREDIT_CARD: method("CREDIT_CARD") } };
}

function normalizeAlertHref(href: string) {
  if (!href.startsWith("/frentista/saidas?session=")) return href;
  const sessionId = href.split("session=")[1]?.split("&")[0];
  return sessionId ? `/ceo/sessoes/${encodeURIComponent(sessionId)}` : "/ceo/alertas";
}

function makeBuckets(period: CeoPeriod, since: Date, timezone: string, paid: CeoPayment[], sessions: CeoSession[], capacity: number) {
  const count = period === "today" ? 24 : Number(period);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(since); if (period === "today") start.setUTCHours(start.getUTCHours() + index); else start.setUTCDate(start.getUTCDate() + index);
    const end = new Date(start); if (period === "today") end.setUTCHours(end.getUTCHours() + 1); else end.setUTCDate(end.getUTCDate() + 1);
    const inRange = (value: string | null) => Boolean(value && new Date(value) >= start && new Date(value) < end);
    const entries = sessions.filter((session) => inRange(session.entered_at)).length;
    const exits = sessions.filter((session) => inRange(session.exited_at)).length;
    const bucketPayments = paid.filter((payment) => inRange(payment.paid_at));
    const label = period === "today" ? new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit" }).format(start) : new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" }).format(start);
    return { label, revenue: bucketPayments.reduce((sum, payment) => sum + Number(payment.amount), 0), payments: bucketPayments.length, entries, exits, occupancy: capacity ? Math.max(0, entries - exits) / capacity * 100 : 0 };
  });
}
