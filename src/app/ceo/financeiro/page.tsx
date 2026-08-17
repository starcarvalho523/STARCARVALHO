import Link from "next/link";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  CreditCard,
  FileSearch,
  Globe2,
  Landmark,
  ReceiptText,
  Scale,
  UserRound,
  WalletCards,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { CeoFilters } from "@/components/ceo-filters";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics, normalizeCeoFilters } from "@/lib/ceo-analytics";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

type Tone = "green" | "blue" | "violet" | "cyan" | "orange" | "slate";

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string; unit?: string; method?: string; status?: string }> }) {
  const query = await searchParams;
  const data = await getCeoAnalytics(normalizeCeoFilters(query));
  const unitNames = new Map(data.units.map((unit) => [unit.id, unit.name]));
  const payments = data.payments.filter((payment) => (!query.method || query.method === "all" || payment.method === query.method) && (!query.status || query.status === "all" || payment.status === query.status));
  const cashReceived = (shiftId: string) => data.paid.filter((payment) => payment.cash_shift_id === shiftId && payment.method === "CASH").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expectedCash = (shift: (typeof data.shifts)[number]) => shift.status === "OPEN" ? Number(shift.opening_amount) + cashReceived(shift.id) : shift.expected_cash_amount;
  for (const shift of data.shifts) if (shift.status === "OPEN") shift.expected_cash_amount = expectedCash(shift);

  return (
    <DashboardShell nav={ceoNav} active="Financeiro" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader title="Financeiro" description="Analise receitas confirmadas, pagamentos e caixas.">
          <CeoFilters units={data.units} />
        </CeoPageHeader>

        <section className="grid gap-3 lg:grid-cols-[1.25fr_1fr_1fr]">
          <article className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
            <div className="flex min-h-[72px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Landmark className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">Receita confirmada</p>
                  <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">{formatMoney(data.metrics.revenue)}</p>
                </div>
              </div>
              <div className="hidden items-end gap-1 sm:flex" aria-hidden="true">
                {[18, 28, 22, 40, 34, 50].map((height, index) => <span key={index} className="w-1.5 rounded-full bg-emerald-200" style={{ height }} />)}
              </div>
            </div>
          </article>

          <RevenueCard label="Estacionamento avulso" value={formatMoney(data.metrics.casualRevenue)} icon={ReceiptText} tone="blue" />
          <RevenueCard label="Mensalidades recebidas" value={formatMoney(data.metrics.monthlyRevenue)} icon={UserRound} tone="blue" />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MethodCard label="Dinheiro" value={formatMoney(data.methods.CASH.amount)} icon={Banknote} tone="green" />
          <MethodCard label="Cartão legado" value={formatMoney(data.methods.CARD.amount)} icon={CreditCard} tone="violet" />
          <MethodCard label="Crédito online" value={formatMoney(data.methods.CREDIT_CARD.amount)} icon={Globe2} tone="blue" />
          <MethodCard label="PIX" value={formatMoney(data.methods.PIX.amount)} icon={CircleDollarSign} tone="cyan" />
          <MethodCard label="Pagamentos" value={String(data.metrics.payments)} icon={WalletCards} tone="orange" />
          <MethodCard label="Diferença de caixa" value={formatMoney(data.metrics.cashDifference)} icon={Scale} tone={data.metrics.cashDifference !== 0 ? "orange" : "slate"} warning={data.metrics.cashDifference !== 0} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-950">Pagamentos</h2>
            <form className="flex flex-wrap gap-2">
              <input type="hidden" name="period" value={data.filters.period} />
              <input type="hidden" name="unit" value={data.filters.unitId} />
              <select name="method" defaultValue={query.method ?? "all"} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                <option value="all">Todos os métodos</option><option value="CASH">Dinheiro</option><option value="PIX">PIX</option><option value="CARD">Cartão legado</option><option value="DEBIT_CARD">Débito</option><option value="CREDIT_CARD">Crédito</option>
              </select>
              <select name="status" defaultValue={query.status ?? "all"} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                <option value="all">Todos os status</option><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="FAILED">Falhou</option>
              </select>
              <button className="rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm">Filtrar</button>
            </form>
          </div>
          {payments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr>{["Horário","Placa","Entrada","Método","Valor","Status","Operador","Unidade","Ação"].map((label)=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
                <tbody>{payments.map((payment)=><tr key={payment.id} className="border-t"><td className="px-4 py-3">{formatDateTime(payment.paid_at ?? payment.created_at)}</td><td className="font-bold">{payment.parking_sessions?.plate_snapshot ?? "—"}</td><td>{payment.parking_sessions?.entered_at ? formatDateTime(payment.parking_sessions.entered_at) : "—"}</td><td>{formatPaymentMethod(payment.method,payment.manual_confirmation)}</td><td className="font-bold">{formatMoney(payment.amount)}</td><td>{formatPaymentStatus(payment.status)}</td><td><Operator name={payment.received_by ? data.names[payment.received_by] ?? "Operador não identificado" : "—"}/></td><td>{unitNames.get(payment.unit_id)}</td><td>{payment.parking_sessions ? <Link className="font-semibold text-blue-600" href={`/ceo/relatorios?period=${data.filters.period}&unit=${data.filters.unitId}&session=${payment.parking_session_id}`}>Ver sessão</Link> : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-28 place-items-center px-6 py-7 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-500"><FileSearch className="size-5" /></span>
                <p className="mt-3 text-sm text-slate-500">Nenhum pagamento encontrado neste período.</p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-5 pt-5 font-bold text-slate-950">Caixas</h2>
          {data.shifts.length ? (
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {data.shifts.map((shift) => {
                const difference = Number(shift.difference_amount);
                const detailHref = `/ceo/financeiro/caixas/${shift.id}?period=${data.filters.period}&unit=${encodeURIComponent(data.filters.unitId)}`;
                return (
                  <article key={shift.id} className={`rounded-2xl border p-4 ${difference !== 0 ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <Operator name={data.names[shift.operator_id] ?? "Operador não identificado"} />
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${shift.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{shift.status === "OPEN" ? "Aberto" : "Fechado"}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{unitNames.get(shift.unit_id)} · abertura {formatDateTime(shift.opened_at)}</p>
                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                      <Cell label="Saldo inicial" value={formatMoney(shift.opening_amount)} />
                      <Cell label="Dinheiro recebido" value={formatMoney(cashReceived(shift.id))} />
                      <Cell label="Esperado" value={formatMoney(shift.expected_cash_amount)} />
                      <Cell label="Declarado" value={shift.declared_cash_amount == null ? "—" : formatMoney(shift.declared_cash_amount)} />
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                      <b className={difference !== 0 ? "text-amber-700" : "text-slate-950"}>Diferença: {formatMoney(shift.difference_amount)}</b>
                      <Link className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700" href={detailHref}>Ver detalhe <span aria-hidden>›</span></Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <Empty text="Nenhum caixa encontrado neste período." />}
        </section>
      </div>
    </DashboardShell>
  );
}

function RevenueCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: ComponentType<{ className?: string }>; tone: Tone }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex min-h-[72px] items-center gap-4"><IconBadge icon={Icon} tone={tone}/><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p></div></div></article>;
}

function MethodCard({ label, value, icon: Icon, tone, warning = false }: { label: string; value: string; icon: ComponentType<{ className?: string }>; tone: Tone; warning?: boolean }) {
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${warning ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}><div className="flex items-center gap-3"><IconBadge icon={Icon} tone={tone} small/><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 truncate text-lg font-bold ${warning ? "text-amber-700" : "text-slate-950"}`}>{value}</p></div></div></article>;
}

function IconBadge({ icon: Icon, tone, small = false }: { icon: ComponentType<{ className?: string }>; tone: Tone; small?: boolean }) {
  const palette = {green:"bg-emerald-50 text-emerald-600",blue:"bg-blue-50 text-blue-600",violet:"bg-violet-50 text-violet-600",cyan:"bg-cyan-50 text-cyan-600",orange:"bg-orange-50 text-orange-600",slate:"bg-slate-100 text-slate-600"}[tone];
  return <span className={`grid shrink-0 place-items-center rounded-xl ${small ? "size-9" : "size-11"} ${palette}`}><Icon className={small ? "size-4" : "size-5"}/></span>;
}

function Cell({label,value}:{label:string;value:string}){return <div><p className="text-xs text-slate-500">{label}</p><p className="font-semibold text-slate-950">{value}</p></div>}
function Operator({name}:{name:string}){return <span className="inline-flex items-center gap-2"><i className="grid size-8 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{name.charAt(0).toUpperCase()}</i><span className="font-medium">{name}</span></span>}
function Empty({text}:{text:string}){return <p className="border-t p-8 text-center text-sm text-slate-500">{text}</p>}
