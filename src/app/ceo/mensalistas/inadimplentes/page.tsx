import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CircleDollarSign, FileSearch, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateBR, getMonthlyAccess, money, monthlyStatus } from "@/lib/monthly-admin";
import { MonthlyTabs, StatusPill } from "../ui";

export const dynamic = "force-dynamic";

export default async function OverduePage() {
  const { unitIds } = await getMonthlyAccess();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: periods } = await supabase
    .from("monthly_billing_periods")
    .select(
      "id,subscription_id,unit_id,reference_year,reference_month,amount,due_date,grace_until,status,monthly_subscriptions(customer_id,plan_name,status)",
    )
    .in("unit_id", unitIds)
    .eq("status", "PENDING")
    .lt("grace_until", today)
    .order("grace_until");

  const customerIds = [
    ...new Set(
      (periods ?? [])
        .map((period: any) => period.monthly_subscriptions?.customer_id)
        .filter(Boolean),
    ),
  ] as string[];
  const admin = createAdminClient();
  const { data: customers } = customerIds.length
    ? await admin
        .from("customer_profiles")
        .select("user_id,full_name")
        .in("user_id", customerIds)
    : { data: [] };
  const names = new Map((customers ?? []).map((customer) => [customer.user_id, customer.full_name]));

  const total = (periods ?? []).reduce((sum, period) => sum + Number(period.amount), 0);
  const suspendedSubscriptions = new Set(
    (periods ?? [])
      .filter((period: any) => period.monthly_subscriptions?.status === "SUSPENDED")
      .map((period) => period.subscription_id),
  ).size;

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader
          title="Mensalistas"
          description="Gestão de contratos, planos e cobranças recorrentes."
        />
        <MonthlyTabs active="overdue" />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Total em atraso"
            value={money(total)}
            icon={<CircleDollarSign className="size-5" />}
            tone="red"
          />
          <Metric
            label="Competências vencidas"
            value={String(periods?.length ?? 0)}
            icon={<FileSearch className="size-5" />}
            tone="amber"
          />
          <Metric
            label="Clientes em atraso"
            value={String(customerIds.length)}
            icon={<UserRound className="size-5" />}
            tone="blue"
          />
          <Metric
            label="Assinaturas suspensas"
            value={String(suspendedSubscriptions)}
            icon={<AlertTriangle className="size-5" />}
            tone="slate"
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-950">Competências em atraso</h2>
            <p className="mt-1 text-xs text-slate-500">
              Situação derivada automaticamente: somente competências PENDING após o fim da tolerância.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-4 py-3">Plano</th>
                  <th className="px-4 py-3">Competência</th>
                  <th className="px-4 py-3">Fim da tolerância</th>
                  <th className="px-4 py-3">Dias em atraso</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-5 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {(periods ?? []).map((period: any) => {
                  const contractStatus = period.monthly_subscriptions?.status ?? "ACTIVE";
                  return (
                    <tr key={period.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-950">
                        {names.get(period.monthly_subscriptions?.customer_id) ?? "Cliente"}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {period.monthly_subscriptions?.plan_name ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {String(period.reference_month).padStart(2, "0")}/{period.reference_year}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{dateBR(period.grace_until)}</td>
                      <td className="px-4 py-4 font-semibold text-red-600">
                        {daysLate(period.grace_until, today)}
                      </td>
                      <td className="px-4 py-4 font-bold text-red-600">{money(period.amount)}</td>
                      <td className="px-4 py-4">
                        <StatusPill
                          status={contractStatus}
                          label={monthlyStatus[contractStatus] ?? contractStatus}
                        />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/ceo/mensalistas/${period.subscription_id}`}
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Abrir assinatura
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!periods?.length ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="font-semibold text-emerald-700">Nenhuma competência inadimplente</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Não há competências pendentes fora do prazo de tolerância.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function daysLate(graceUntil: string, today: string) {
  const end = new Date(`${graceUntil}T12:00:00Z`).getTime();
  const now = new Date(`${today}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((now - end) / 86_400_000));
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "red" | "amber" | "blue" | "slate";
}) {
  const palette = {
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-extrabold tracking-tight ${tone === "red" ? "text-red-600" : "text-slate-950"}`}>
            {value}
          </p>
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ${palette}`}>{icon}</span>
      </div>
    </article>
  );
}
