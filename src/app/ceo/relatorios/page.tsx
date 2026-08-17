import Link from "next/link";
import {
  Banknote,
  CalendarClock,
  CarFront,
  CashRegister,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Info,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { CeoFilters } from "@/components/ceo-filters";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics, normalizeCeoFilters } from "@/lib/ceo-analytics";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPaymentMethod,
  formatSessionFinancialStatus,
  formatVehicleType,
  sessionParkingStatus,
} from "@/lib/operator-format";

export const dynamic = "force-dynamic";

type Tone = "blue" | "green" | "violet";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string; session?: string }>;
}) {
  const query = await searchParams;
  const data = await getCeoAnalytics(normalizeCeoFilters(query));
  const selected = data.sessions.find((session) => session.id === query.session);
  const sessionHref = (id: string) =>
    `/ceo/relatorios?period=${data.filters.period}&unit=${data.filters.unitId}&session=${id}`;

  const openShifts = data.shifts.filter((shift) => shift.status === "OPEN").length;
  const closedShifts = data.shifts.filter((shift) => shift.status === "CLOSED").length;

  return (
    <DashboardShell nav={ceoNav} active="Relatórios" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <CeoPageHeader
          title="Relatórios"
          description="Análises operacionais e financeiras baseadas nos mesmos dados do painel."
        >
          <CeoFilters units={data.units} />
        </CeoPageHeader>

        <div className="grid gap-4 lg:grid-cols-3">
          <SummaryCard
            title="Operacional"
            icon={CarFront}
            tone="blue"
            primaryLabel="Entradas no período"
            primaryValue={String(data.metrics.entries)}
            rows={[
              ["Saídas", data.metrics.exits],
              ["Veículos no pátio", data.metrics.active],
              [
                "Permanência média",
                data.metrics.averageMinutes
                  ? formatDuration(Math.round(data.metrics.averageMinutes))
                  : "—",
              ],
              ["Ocupação atual", `${data.metrics.occupancy.toFixed(1)}%`],
            ]}
          />

          <SummaryCard
            title="Financeiro"
            icon={CircleDollarSign}
            tone="green"
            primaryLabel="Receita confirmada"
            primaryValue={formatMoney(data.metrics.revenue)}
            rows={[
              ["Ticket médio", data.metrics.ticket ? formatMoney(data.metrics.ticket) : "—"],
              ["Dinheiro", formatMoney(data.methods.CASH.amount)],
              ["PIX", formatMoney(data.methods.PIX.amount)],
              ["Cartão legado", formatMoney(data.methods.CARD.amount)],
              ["Débito", formatMoney(data.methods.DEBIT_CARD.amount)],
              ["Crédito", formatMoney(data.methods.CREDIT_CARD.amount)],
              ["Pagamentos", data.metrics.payments],
            ]}
          />

          <SummaryCard
            title="Caixas"
            icon={CashRegister}
            tone="violet"
            primaryLabel="Turnos no período"
            primaryValue={String(data.shifts.length)}
            rows={[
              ["Abertos", openShifts],
              ["Fechados", closedShifts],
              ["Diferença total", formatMoney(data.metrics.cashDifference)],
            ]}
            emphasizeLast
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DetailCard
            title="Cobertura de mensalistas"
            subtitle="Uso do estacionamento coberto por contratos mensais"
            icon={UsersRound}
            tone="blue"
          >
            <div className="grid gap-x-8 sm:grid-cols-2">
              <MetricRow label="Estadias cobertas" value={data.coverage.coveredStays} />
              <MetricRow
                label="Média de estadias por mensalista"
                value={data.coverage.averageStaysPerSubscriber.toFixed(1).replace(".", ",")}
              />
              <MetricRow label="Entradas mensalistas" value={data.coverage.monthlyEntries} />
              <MetricRow
                label="Participação mensal"
                value={`${data.coverage.monthlyShare.toFixed(1).replace(".", ",")}%`}
              />
              <MetricRow label="Veículos mensais usados" value={data.coverage.monthlyVehiclesUsed} />
              <MetricRow
                label="Participação casual"
                value={`${data.coverage.casualShare.toFixed(1).replace(".", ",")}%`}
              />
            </div>
          </DetailCard>

          <DetailCard
            title="Valor avulso teórico dispensado"
            subtitle="Estimativa operacional das estadias cobertas por mensalidade"
            icon={ReceiptText}
            tone="green"
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
              <dl>
                <MetricRow
                  label="Valor teórico"
                  value={formatMoney(data.coverage.theoreticalWaived)}
                  accent="green"
                />
                <MetricRow label="MRR contratado ativo" value={formatMoney(data.mrr.amount)} />
                <MetricRow label="MRR suspenso" value={formatMoney(data.mrr.suspendedAmount)} />
              </dl>

              <div className="flex gap-3 rounded-2xl bg-emerald-50/80 p-4 text-sm text-emerald-900">
                <Info className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-bold">Indicador operacional</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">
                    Não representa receita, caixa ou pagamento confirmado.
                  </p>
                </div>
              </div>
            </div>
          </DetailCard>
        </div>

        {selected ? (
          <section className="rounded-[22px] border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Detalhe da sessão
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-950">
                  {selected.plate_snapshot}
                </h2>
              </div>
              <Link
                className="text-sm font-bold text-blue-600"
                href={`/ceo/relatorios?period=${data.filters.period}&unit=${data.filters.unitId}`}
              >
                Fechar
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Cell label="Entrada" value={formatDateTime(selected.entered_at)} />
              <Cell
                label="Saída"
                value={selected.exited_at ? formatDateTime(selected.exited_at) : "—"}
              />
              <Cell label="Veículo" value={formatVehicleType(selected.vehicle_type)} />
              <Cell
                label="Status"
                value={
                  sessionParkingStatus(
                    selected.status,
                    selected.entry_mode,
                    selected.financial_obligation,
                  ).label
                }
              />
              <Cell
                label="Forma/modalidade"
                value={
                  formatSessionFinancialStatus(
                    selected.entry_mode,
                    selected.financial_obligation,
                  )
                    ? "Mensalidade"
                    : "Avulso"
                }
              />
              <Cell
                label="Valor"
                value={formatMoney(selected.final_amount ?? selected.calculated_amount)}
              />
            </div>
          </section>
        ) : null}

        <DataSection
          title="Sessões"
          icon={Clock3}
          empty={!data.sessions.length ? "Nenhuma sessão encontrada neste período." : undefined}
          emptyHint="As informações aparecerão aqui quando houver sessões."
        >
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500">
              <tr>
                {["Placa", "Entrada", "Saída", "Status", "Forma/modalidade", "Valor", "Ação"].map(
                  (label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.sessions.map((session) => (
                <tr key={session.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold">{session.plate_snapshot}</td>
                  <td className="px-4 py-3">{formatDateTime(session.entered_at)}</td>
                  <td className="px-4 py-3">
                    {session.exited_at ? formatDateTime(session.exited_at) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {sessionParkingStatus(
                      session.status,
                      session.entry_mode,
                      session.financial_obligation,
                    ).label}
                  </td>
                  <td className="px-4 py-3">
                    {formatSessionFinancialStatus(
                      session.entry_mode,
                      session.financial_obligation,
                    )
                      ? "Mensalidade"
                      : "Avulso"}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {formatMoney(session.final_amount ?? session.calculated_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <Link className="font-semibold text-blue-600" href={sessionHref(session.id)}>
                      Ver sessão
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataSection>

        <DataSection
          title="Pagamentos detalhados"
          icon={CreditCard}
          tone="green"
          empty={!data.payments.length ? "Nenhum pagamento encontrado neste período." : undefined}
          emptyHint="As informações aparecerão aqui quando houver pagamentos."
        >
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500">
              <tr>
                {["Data", "Origem", "Entrada", "Método", "Status", "Valor", "Ação"].map(
                  (label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    {formatDateTime(payment.paid_at ?? payment.created_at)}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {payment.payment_subject_type === "MONTHLY_BILLING_PERIOD"
                      ? "Mensalidade"
                      : payment.parking_sessions?.plate_snapshot ?? "Estacionamento avulso"}
                  </td>
                  <td className="px-4 py-3">
                    {payment.parking_sessions?.entered_at
                      ? formatDateTime(payment.parking_sessions.entered_at)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {formatPaymentMethod(payment.method, payment.manual_confirmation)}
                  </td>
                  <td className="px-4 py-3">{payment.status === "PAID" ? "Pago" : payment.status}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(payment.amount)}</td>
                  <td className="px-4 py-3">
                    {payment.parking_session_id ? (
                      <Link
                        className="font-semibold text-blue-600"
                        href={sessionHref(payment.parking_session_id)}
                      >
                        Ver sessão
                      </Link>
                    ) : (
                      "Mensalidade"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataSection>
      </div>
    </DashboardShell>
  );
}

function SummaryCard({
  title,
  icon: Icon,
  tone,
  primaryLabel,
  primaryValue,
  rows,
  emphasizeLast = false,
}: {
  title: string;
  icon: typeof CarFront;
  tone: Tone;
  primaryLabel: string;
  primaryValue: string;
  rows: Array<[string, string | number]>;
  emphasizeLast?: boolean;
}) {
  const palette = {
    blue: {
      icon: "bg-blue-50 text-blue-600",
      value: "text-blue-600",
      highlight: "bg-blue-50/65 text-blue-700",
    },
    green: {
      icon: "bg-emerald-50 text-emerald-600",
      value: "text-emerald-600",
      highlight: "bg-emerald-50/65 text-emerald-700",
    },
    violet: {
      icon: "bg-violet-50 text-violet-600",
      value: "text-violet-600",
      highlight: "bg-violet-50/65 text-violet-700",
    },
  }[tone];

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4 border-b border-slate-100 pb-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${palette.icon}`}>
          <Icon className="size-6" />
        </span>
        <div>
          <h2 className="font-extrabold text-slate-950">{title}</h2>
          <p className={`mt-1 text-2xl font-extrabold ${palette.value}`}>{primaryValue}</p>
          <p className="text-xs text-slate-500">{primaryLabel}</p>
        </div>
      </div>

      <dl className="mt-3">
        {rows.map(([label, value], index) => {
          const highlighted = emphasizeLast && index === rows.length - 1;
          return (
            <div
              key={label}
              className={`flex items-center justify-between gap-4 border-b border-slate-100 px-1 py-2.5 text-sm last:border-0 ${
                highlighted ? `mt-1 rounded-xl border-0 px-3 ${palette.highlight}` : ""
              }`}
            >
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-bold text-slate-950">{value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function DetailCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof UsersRound;
  tone: "blue" | "green";
  children: React.ReactNode;
}) {
  const palette =
    tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600";

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${palette}`}>
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="font-extrabold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "green";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-bold ${accent === "green" ? "text-emerald-700" : "text-slate-950"}`}>
        {value}
      </dd>
    </div>
  );
}

function DataSection({
  title,
  icon: Icon,
  tone = "blue",
  children,
  empty,
  emptyHint,
}: {
  title: string;
  icon: typeof Clock3;
  tone?: "blue" | "green";
  children: React.ReactNode;
  empty?: string;
  emptyHint?: string;
}) {
  const palette =
    tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600";
  const EmptyIcon = tone === "green" ? CreditCard : CalendarClock;

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <span className={`grid size-10 place-items-center rounded-xl ${palette}`}>
          <Icon className="size-5" />
        </span>
        <h2 className="font-extrabold text-slate-950">{title}</h2>
      </div>

      {empty ? (
        <div className="flex min-h-[130px] items-center justify-center gap-4 px-6 py-6 text-slate-500">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <EmptyIcon className="size-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-600">{empty}</p>
            {emptyHint ? <p className="mt-1 text-xs text-slate-400">{emptyHint}</p> : null}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
