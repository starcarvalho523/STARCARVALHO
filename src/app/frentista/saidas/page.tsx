import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { OperationBadge } from "@/components/operation-badge";
import { CompleteExitForm, PaymentForm, StartExitForm } from "@/components/session-operation-form";
import { formatDateTime, formatDuration, formatMoney, getOperatorDashboard } from "@/lib/operator-data";
import { parkingStatus } from "@/lib/operator-format";
import { operatorNav } from "@/lib/operator-nav";

export const dynamic = "force-dynamic";

export default async function ExitsPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const [{ session }, data] = await Promise.all([searchParams, getOperatorDashboard()]);
  const selected = data.active_sessions.find((item) => item.id === session) ?? data.active_sessions[0];
  return <DashboardShell nav={operatorNav} active="Saídas" role="Frentista"><div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-3xl font-bold">Saída de veículo</h1><p className="text-sm text-slate-500">Selecione uma placa ativa e siga o fluxo de cobrança.</p></div>
    <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <section className="rounded-2xl border bg-white p-4"><h2 className="font-bold">Veículos ativos</h2><div className="mt-3 space-y-2">{data.active_sessions.map((item) => <Link key={item.id} href={`/frentista/saidas?session=${item.id}`} className={`flex justify-between rounded-xl border p-3 ${selected?.id === item.id ? "border-blue-500 bg-blue-50" : ""}`}><b>{item.plate}</b><span className="text-sm text-slate-500">{formatDuration(item.duration_minutes)}</span></Link>)}{data.active_sessions.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhum veículo no pátio.</p> : null}</div></section>
      {selected ? <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex justify-between gap-4"><div><p className="text-sm text-slate-500">Placa</p><h2 className="text-3xl font-bold">{selected.plate}</h2></div><OperationBadge {...parkingStatus(selected.status)} /></div><dl className="my-6 grid grid-cols-1 gap-4 border-y py-5 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Entrada</dt><dd className="font-semibold">{formatDateTime(selected.entered_at, data.unit.timezone)}</dd></div><div><dt className="text-slate-500">Permanência</dt><dd className="font-semibold">{formatDuration(selected.duration_minutes)}</dd></div><div><dt className="text-slate-500">Tarifa</dt><dd className="font-semibold">{selected.tariff_name}</dd></div><div><dt className="text-slate-500">Valor</dt><dd className="text-xl font-bold text-emerald-600">{formatMoney(selected.amount)}</dd></div></dl>
        {selected.status === "OPEN" ? <StartExitForm sessionId={selected.id} /> : null}
        {selected.status === "PAYMENT_PENDING" ? <div className="space-y-3"><p className="text-sm font-semibold">Registrar recebimento manual</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><PaymentForm sessionId={selected.id} method="CARD"/><PaymentForm sessionId={selected.id} method="CASH"/></div><p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><ShieldAlert className="size-4 shrink-0"/>PIX integrado ainda não configurado; não é possível confirmar PIX manualmente.</p></div> : null}
        {selected.status === "PAID" ? <CompleteExitForm sessionId={selected.id} /> : null}
      </section> : <section className="grid min-h-64 place-items-center rounded-2xl border bg-white p-6 text-center text-slate-500">Selecione um veículo.</section>}
    </div>
  </div></DashboardShell>;
}

