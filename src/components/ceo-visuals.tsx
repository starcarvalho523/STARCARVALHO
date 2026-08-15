import Link from "next/link";
import type { CeoAlert } from "@/lib/ceo-analytics";
import { formatMoney, formatDuration } from "@/lib/operator-format";

type ChartRow = { label: string; revenue: number; occupancy: number; payments: number };

export function AnalyticsChart({ title, rows, field, empty }: { title: string; rows: ChartRow[]; field: "revenue" | "occupancy"; empty: string }) {
  const max = Math.max(0, ...rows.map((row) => row[field]));
  return <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <h2 className="font-bold">{title}</h2>
    {max === 0 ? <p className="grid min-h-24 place-items-center px-4 text-center text-sm text-slate-500">{empty}</p> :
      <div className="mt-5 flex h-44 items-end gap-1" aria-label={title}>{rows.map((row, index) => {
        const detail = field === "revenue" ? `${row.label} · ${formatMoney(row.revenue)} · ${row.payments} ${row.payments === 1 ? "pagamento" : "pagamentos"}` : `${row.label} · ${row.occupancy.toFixed(0)}%`;
        return <div key={`${row.label}-${index}`} title={detail} aria-label={detail} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none">
          <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block group-focus:block">{detail}</span>
          <div className="relative flex h-[calc(100%-1.25rem)] w-full items-end">
            {row[field] > 0 ? <span className="absolute inset-x-0 z-[1] text-center text-[9px] font-bold text-blue-700" style={{ bottom: `calc(${row[field] / max * 100}% + 2px)` }}>{field === "revenue" ? formatMoney(row.revenue) : `${row.occupancy.toFixed(0)}%`}</span> : null}
            <div className={`w-full min-h-0.5 rounded-t transition-opacity group-hover:opacity-75 ${field === "revenue" ? "bg-blue-500" : "bg-emerald-500"}`} style={{ height: `${row[field] > 0 ? Math.max(8, row[field] / max * 100) : 1}%` }} />
          </div>
          <span className="mt-2 max-w-full truncate text-[9px] text-slate-400">{row.label}</span>
        </div>;
      })}</div>}
  </section>;
}

export function AlertList({ alerts, limit }: { alerts: CeoAlert[]; limit?: number }) {
  const rows = limit ? alerts.slice(0, limit) : alerts;
  if (!rows.length) return <p className="p-8 text-center text-sm text-slate-500">Nenhum alerta ativo.</p>;
  return <div className="divide-y">{rows.map((alert) => {
    const action = alert.href.startsWith("/ceo/mensalistas") ? "Ver mensalistas" : alert.title.includes("caixa") ? "Ver caixa" : alert.title.includes("Sessão") || alert.title.includes("Pagamento") ? "Ver sessão" : "Ver unidade";
    return <article key={alert.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className={`h-fit rounded-full px-2.5 py-1 text-xs font-bold ${alert.severity === "Crítico" ? "bg-red-50 text-red-700" : alert.severity === "Atenção" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{alert.severity}</span>
      <div className="flex-1"><p className="font-semibold">{alert.title}</p><p className="text-xs font-medium text-slate-500">{alert.unitName}</p><p className="mt-1 text-xs text-slate-500">{alert.description}</p></div>
      <Link href={alert.href} className="text-sm font-semibold text-blue-600 hover:text-blue-700">{action}</Link>
    </article>;
  })}</div>;
}

export function InsightGrid({ entries, averageMinutes, occupancy, ticket }: { entries: number; averageMinutes: number; occupancy: number; ticket: number }) {
  if (!entries && !averageMinutes && !occupancy && !ticket) return <div className="rounded-xl border border-dashed p-5 text-center"><p className="font-semibold">Ainda não há movimentação suficiente para gerar tendências.</p><p className="mt-1 text-xs text-slate-500">Os indicadores serão calculados automaticamente conforme novas operações forem registradas.</p></div>;
  const data = [["Entradas no período", String(entries)], ["Permanência média", averageMinutes ? formatDuration(Math.round(averageMinutes)) : "Sem base"], ["Ocupação atual", `${occupancy.toFixed(1).replace(".", ",")}%`], ["Receita média por pagamento", ticket ? formatMoney(ticket) : "Sem base"]];
  return <div className="grid gap-2 sm:grid-cols-2">{data.map(([label, value]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div>;
}

