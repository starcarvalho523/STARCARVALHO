export type CustomerUnit = { id: string; name: string };

export type CeoCustomerRow = {
  customer_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string | null;
  vehicle_count: number;
  session_count: number;
  last_visit_at: string | null;
  has_active_session: boolean;
  monthly_status: string | null;
  monthly_plan: string | null;
  eligible_for_monthly: boolean;
  units: CustomerUnit[];
};

export type CeoCustomerDetail = {
  profile: { customer_id: string; full_name: string; email: string | null; is_active: boolean; created_at: string | null };
  vehicles: Array<{ id: string; plate: string; vehicle_type: string; notes: string | null; last_visit_at: string | null; has_active_session: boolean }>;
  sessions: Array<{ id: string; unit_id: string; unit_name: string; plate: string; vehicle_type: string; status: string; entered_at: string; exited_at: string | null; calculated_amount: number | null; final_amount: number | null; payment_status: string; entry_mode: string | null; financial_obligation: string | null }>;
  payments: Array<{ id: string; unit_id: string; parking_session_id: string | null; amount: number; method: string; status: string; provider: string | null; paid_at: string | null; created_at: string; payment_subject_type: string | null }>;
  subscriptions: Array<{ id: string; unit_id: string; unit_name: string; plan_id: string | null; plan_name: string; status: string; starts_on: string | null; ends_on: string | null; due_day: number | null; grace_days: number | null; contracted_price: number | null; vehicle_id: string | null; cancel_at_period_end: boolean }>;
  billing_periods: Array<{ id: string; subscription_id: string; reference_year: number; reference_month: number; due_date: string; grace_until: string; amount: number; status: string; paid_at: string | null }>;
  eligible_for_monthly: boolean;
};

export function monthlyLabel(status: string | null) {
  return ({ ACTIVE: "Ativa", PENDING_ACTIVATION: "Aguardando ativação", SUSPENDED: "Suspensa", CANCELED: "Cancelada" } as Record<string, string>)[status ?? ""] ?? "Avulso";
}

export function sessionLabel(status: string) {
  return ({ OPEN: "No pátio", PAYMENT_PENDING: "Aguardando pagamento", PAID: "Pagamento confirmado", EXITED: "Encerrada", MANUAL_REVIEW: "Revisão manual" } as Record<string, string>)[status] ?? status;
}

export function paymentLabel(status: string) {
  return ({ PENDING: "Pendente", PAID: "Pago", FAILED: "Falhou", REFUNDED: "Estornado" } as Record<string, string>)[status] ?? status;
}

export function vehicleLabel(type: string) {
  return ({ CAR: "Carro", MOTORCYCLE: "Moto", TRUCK: "Caminhão", OTHER: "Outro" } as Record<string, string>)[type] ?? "Veículo";
}

export function methodLabel(method: string) {
  return ({ CASH: "Dinheiro", PIX: "PIX", CARD: "Cartão", DEBIT_CARD: "Débito", CREDIT_CARD: "Crédito" } as Record<string, string>)[method] ?? method;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(value));
}

export function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "Ainda não calculado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}
