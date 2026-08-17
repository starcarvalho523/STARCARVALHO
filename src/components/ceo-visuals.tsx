import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BarChart3, CircleDollarSign, Clock3, UsersRound } from "lucide-react";
import type { CeoAlert } from "@/lib/ceo-analytics";
import { formatMoney, formatDuration } from "@/lib/operator-format";

type ChartRow = { label: string; revenue: number; occupancy: number; payments: number };

export function AnalyticsChart({ title, rows, field, empty }: { title: string; rows: ChartRow[]; field: "revenue" | "occupancy"; empty: string }) {
  const max = Math.max(0, ...rows.map((row) => row[field]));
  const emptyHint = field === "revenue" ? "Assim que houver pagamentos confirmados, o gráfico será exibido aqui." : "Os dados de ocupação aparecerão conforme houver movimentações.";
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><BarChart3 className="size-4.5"/></span><h2 className="font-bold text-slate-950">{title}</h2></div></div>
    {max === 0 ? <div className="grid min-h-32 place-items-center px-4 py-5 text-center"><div><BarChart3 className="mx-auto size-8 text-slate-200"/><p className="mt-3 text-sm font-medium text-slate-500">{empty}</p><p className="mt-1 text-xs text-slate-400">{emptyHint}</p></div></div> :
      <div className="mt-5 flex h-44 items-end gap-1" aria-label={title}>{rows.map((row, index) => {
        const detail = field === "revenue" ? `${row.label} · ${formatMoney(row.revenue)} · ${row.payments} ${row.payments === 1 ? "pagamento" : "pagamentos"}` : `${row.label} · ${row.occupancy.toFixed(0)}%`;
        return <div key={`${row.label}-${index}`} title={detail} aria-label={detail} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none">
          <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block group-focus:block">{detail}</span>
          <div className="relative flex h-[calc(100%-1.25rem)] w-full items-end">{row[field] > 0 ? <span className="absolute inset-x-0 z-[1] text-center text-[9px] font-bold text-blue-700" style={{ bottom: `calc(${row[field] / max * 100}% + 2px)` }}>{field === "revenue" ? formatMoney(row.revenue) : `${row.occupancy.toFixed(0)}%`}</span> : null}<div className={`w-full min-h-0.5 rounded-t transition-opacity group-hover:opacity-75 ${field === "revenue" ? "bg-blue-500" : "bg-emerald-500"}`} style={{ height: `${row[field] > 0 ? Math.max(8, row[field] / max * 100) : 1}%` }} /></div>
          <span className="mt-2 max-w-full truncate text-[9px] text-slate-400">{row.label}</span>
        </div>;
      })}</div>}
  </section>;
}

export function AlertList({ alerts, limit }: { alerts: CeoAlert[]; limit?: number }) {
  const rows = limit ? alerts.slice(0, limit) : alerts;
  if (!rows.length) return <div className="grid min-h-36 place-items-center px-5 pb-5 text-center"><div><AlertTriangle className="mx-auto size-7 text-slate-200"/><p className="mt-2 text-sm font-medium text-slate-500">Nenhum alerta prioritário ativo.</p></div></div>;
  return <div className="space-y-2 px-4 pb-4">{rows.map((alert) => {
    const action = alert.href.startsWith("/ceo/mensalistas") ? "Ver mensalistas" : alert.title.includes("caixa") ? "Ver caixa" : alert.title.includes("Sessão") || alert.title.includes("Pagamento") ? "Ver sessão" : "Ver unidade";
    const critical=alert.severity === "Crítico";
    return <article key={alert.id} className={`rounded-xl border p-3.5 ${critical?"border-red-100 bg-red-50/70":"border-amber-100 bg-amber-50/70"}`}>
      <div className="flex items-start gap-3"><span className={`mt-0.5 h-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${critical ? "bg-red-100 text-red-700" : alert.severity === "Atenção" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{alert.severity}</span><div className="min-w-0 flex-1"><p className="font-bold text-slate-950">{alert.title}</p><p className="text-xs font-medium text-slate-500">{alert.unitName}</p><p className="mt-1 text-xs leading-5 text-slate-500">{alert.description}</p></div><Link href={alert.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">{action}<ArrowUpRight className="size-3.5"/></Link></div>
    </article>;
  })}</div>;
}

export function InsightGrid({ entries, averageMinutes, occupancy, ticket }: { entries: number; averageMinutes: number; occupancy: number; ticket: number }) {
  const data = [
    {label:"Entradas no período",value:String(entries),icon:UsersRound,tone:"bg-blue-50 text-blue-600"},
    {label:"Permanência média",value:averageMinutes ? formatDuration(Math.round(averageMinutes)) : "Dados insuficientes",icon:Clock3,tone:"bg-emerald-50 text-emerald-600"},
    {label:"Ocupação atual",value:`${occupancy.toFixed(1).replace(".", ",")}%`,icon:BarChart3,tone:"bg-violet-50 text-violet-600"},
    {label:"Receita média por pagamento",value:ticket ? formatMoney(ticket) : "Dados insuficientes",icon:CircleDollarSign,tone:"bg-orange-50 text-orange-600"},
  ];
  return <div className="grid gap-2 sm:grid-cols-2">{data.map(({label,value,icon:Icon,tone}) => <div key={label} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-4"/></span><div className="min-w-0"><p className="text-[11px] leading-4 text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-bold text-slate-950">{value}</p></div></div>)}</div>;
}
