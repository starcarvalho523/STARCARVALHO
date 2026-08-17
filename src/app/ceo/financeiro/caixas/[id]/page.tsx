import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  ReceiptText,
  Scale,
  UserRound,
  WalletCards,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics, normalizeCeoFilters } from "@/lib/ceo-analytics";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getCeoAnalytics(normalizeCeoFilters(query));
  const shift = data.shifts.find((item) => item.id === id);
  if (!shift) notFound();

  const unitName = data.units.find((unit) => unit.id === shift.unit_id)?.name ?? "Unidade não identificada";
  const operatorName = data.names[shift.operator_id] ?? "Operador não identificado";
  const payments = data.paid.filter((payment) => payment.cash_shift_id === shift.id);
  const cashReceived = payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expected = shift.status === "OPEN" ? Number(shift.opening_amount) + cashReceived : Number(shift.expected_cash_amount);
  const difference = Number(shift.difference_amount);
  const backHref = `/ceo/financeiro?period=${data.filters.period}&unit=${encodeURIComponent(data.filters.unitId)}`;

  return (
    <DashboardShell nav={ceoNav} active="Financeiro" role="CEO">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <Link href={backHref} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600">
            <ArrowLeft className="size-3.5" />
            Voltar para Financeiro
          </Link>
          <CeoPageHeader title="Detalhe do caixa" description={`${unitName} · abertura ${formatDateTime(shift.opened_at)}`} />
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Status" value={shift.status === "OPEN" ? "Aberto" : "Fechado"} icon={WalletCards} tone={shift.status === "OPEN" ? "green" : "slate"} />
          <SummaryCard label="Operador" value={operatorName} icon={UserRound} tone="blue" />
          <SummaryCard label="Diferença" value={formatMoney(difference)} icon={Scale} tone={difference !== 0 ? "orange" : "green"} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><CalendarClock className="size-4" /></span>
              <div>
                <h2 className="font-bold text-slate-950">Operação do caixa</h2>
                <p className="text-xs text-slate-400">Linha do tempo e identificação do turno</p>
              </div>
            </div>
            <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Cell label="Unidade" value={unitName} />
              <Cell label="Operador" value={operatorName} />
              <Cell label="Abertura" value={formatDateTime(shift.opened_at)} />
              <Cell label="Fechamento" value={shift.closed_at ? formatDateTime(shift.closed_at) : "Em aberto"} />
              <Cell label="Pagamentos vinculados" value={String(payments.length)} />
              <Cell label="Situação" value={shift.status === "OPEN" ? "Turno em andamento" : "Turno encerrado"} />
            </div>
          </article>

          <article className={`rounded-2xl border bg-white p-5 shadow-sm ${difference !== 0 ? "border-amber-200" : "border-emerald-100"}`}>
            <div className="flex items-center gap-3">
              <span className={`grid size-10 place-items-center rounded-xl ${difference !== 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}><CircleDollarSign className="size-4" /></span>
              <div>
                <h2 className="font-bold text-slate-950">Conciliação financeira</h2>
                <p className="text-xs text-slate-400">Valores apurados para este caixa</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Cell label="Saldo inicial" value={formatMoney(shift.opening_amount)} />
              <Cell label="Dinheiro recebido" value={formatMoney(cashReceived)} />
              <Cell label="Esperado" value={formatMoney(expected)} />
              <Cell label="Declarado" value={shift.declared_cash_amount == null ? "—" : formatMoney(shift.declared_cash_amount)} />
            </div>
            <div className={`mt-5 rounded-2xl p-4 ${difference !== 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              <p className="text-xs font-semibold">Diferença do caixa</p>
              <p className="mt-1 text-2xl font-extrabold">{formatMoney(difference)}</p>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><ReceiptText className="size-4" /></span>
            <div>
              <h2 className="font-bold text-slate-950">Pagamentos deste caixa</h2>
              <p className="text-xs text-slate-400">Somente pagamentos vinculados ao turno selecionado</p>
            </div>
          </div>
          {payments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr>{["Horário","Placa","Método","Valor","Status"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
                <tbody>{payments.map((payment) => <tr key={payment.id} className="border-t"><td className="px-4 py-3">{formatDateTime(payment.paid_at ?? payment.created_at)}</td><td className="font-bold">{payment.parking_sessions?.plate_snapshot ?? "—"}</td><td>{formatPaymentMethod(payment.method, payment.manual_confirmation)}</td><td className="font-bold">{formatMoney(payment.amount)}</td><td>{formatPaymentStatus(payment.status)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="p-8 text-center text-sm text-slate-500">Nenhum pagamento vinculado a este caixa.</p>}
        </section>

        {shift.notes ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Observações</h2><p className="mt-2 text-sm text-slate-600">{shift.notes}</p></section> : null}
      </div>
    </DashboardShell>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Banknote; tone: "green" | "blue" | "orange" | "slate" }) {
  const palette = { green: "bg-emerald-50 text-emerald-600", blue: "bg-blue-50 text-blue-600", orange: "bg-orange-50 text-orange-600", slate: "bg-slate-100 text-slate-600" }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${palette}`}><Icon className="size-4" /></span><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p></div></div></article>;
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-950">{value}</p></div>;
}
