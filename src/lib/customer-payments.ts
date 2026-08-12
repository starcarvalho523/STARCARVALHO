export type CustomerPaymentRecord = {
  id: string;
  amount: number;
  method: string;
  status: string;
  provider: string | null;
  paid_at: string | null;
  created_at: string;
};

export type CustomerParkingPayment = {
  kind: "PARKING_SESSION";
  payment: CustomerPaymentRecord;
  session: {
    plate_snapshot: string;
    vehicle_type: string;
    entered_at: string;
    exited_at: string | null;
    parking_units: { name: string; timezone: string } | null;
  };
};

export type CustomerMonthlyPayment = {
  kind: "MONTHLY_BILLING_PERIOD";
  payment: CustomerPaymentRecord;
  period: {
    reference_year: number;
    reference_month: number;
    monthly_subscriptions: {
      plan_name: string;
      parking_units: { name: string; timezone: string } | null;
    } | null;
  };
};

export type CustomerPaymentHistoryRow = CustomerParkingPayment | CustomerMonthlyPayment;

type SessionSource = CustomerParkingPayment["session"] & { payments: CustomerPaymentRecord[] };
type MonthlySource = CustomerMonthlyPayment["period"] & { payments: CustomerPaymentRecord[] };

export function buildCustomerPaymentHistory(sessions: SessionSource[], monthlyPeriods: MonthlySource[]) {
  return [
    ...sessions.flatMap((session) => session.payments.map((payment): CustomerParkingPayment => ({ kind: "PARKING_SESSION", payment, session }))),
    ...monthlyPeriods.flatMap((period) => period.payments.map((payment): CustomerMonthlyPayment => ({ kind: "MONTHLY_BILLING_PERIOD", payment, period }))),
  ].sort((a, b) => paymentTime(b.payment) - paymentTime(a.payment));
}

export function findCustomerPayment(rows: CustomerPaymentHistoryRow[], paymentId?: string) {
  return paymentId ? rows.find((row) => row.payment.id === paymentId) ?? null : null;
}

export function formatBillingCompetence(year: number, month: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function paymentDisplayStatus(status: string) {
  if (status === "PAID") return "Pago";
  if (status === "PENDING") return "Pendente";
  if (status === "FAILED") return "Falhou";
  return status;
}

function paymentTime(payment: CustomerPaymentRecord) {
  return new Date(payment.paid_at ?? payment.created_at).getTime();
}
