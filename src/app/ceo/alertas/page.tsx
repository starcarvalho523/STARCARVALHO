import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BellRing, CircleDollarSign, Search, ShieldAlert, Siren, Wrench } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics, normalizeCeoFilters, type CeoAlert } from "@/lib/ceo-analytics";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FilterKey = "all" | "operacional" | "financeiro" | "critical";
type SeverityKey = "all" | "Info" | "Atenção" | "Crítico";

export default async function Page({ searchParams }: { searchParams: Promise<{ unit?: string; filter?: string; severity?: string; q?: string }> }) {
  const p = await searchParams;
  const d = await getCeoAnalytics(normalizeCeoFilters({ period: "today", unit: p.unit }));
  const supabase = await createClient();

  const activationSubscriptionIds = [...new Set(
    d.alerts
      .filter((alert) => alert.title.startsWith("Primeiro pagamento") && alert.href.startsWith("/ceo/mensalistas/"))
      .map((alert) => alert.href.split("/").pop())
      .filter((id): id is string => Boolean(id && id !== "inadimplentes" && id !== "automacao")),
  )];
  const { data: activationSubscriptions } = activationSubscriptionIds.length
    ? await supabase.from("monthly_subscriptions").select("id,plan_name").in("id", activationSubscriptionIds)
    : { data: [] };
  const planNames = new Map((activationSubscriptions ?? []).map((subscription) => [subscription.id, subscription.plan_name]));
  const activeById = new Map(d.active.map((session) => [session.id, session]));

  const enrichedAlerts = d.alerts.map((alert) => enrichAlert(alert, activeById, planNames));
  const selectedUnit = p.unit && d.units.some((unit) => unit.id === p.unit) ? p.unit : "all";
  const filter: FilterKey = ["all", "operacional", "financeiro", "critical"].includes(p.filter ?? "") ? p.filter as FilterKey : "all";
  const severity: SeverityKey = ["Info", "Atenção", "Crítico"].includes(p.severity ?? "") ? p.severity as SeverityKey : "all";
  const q = (p.q ?? "").trim().toLowerCase();

  const alerts = enrichedAlerts.filter((alert) => {
    const categoryMatch = filter === "all" || (filter === "critical" && alert.severity === "Crítico") || alert.category.toLowerCase() === filter;
    const severityMatch = severity === "all" || alert.severity === severity;
    const searchMatch = !q || `${alert.title} ${alert.description} ${alert.unitName}`.toLowerCase().includes(q);
    return categoryMatch && severityMatch && searchMatch;
  });

  const counts = {
    all: enrichedAlerts.length,
    critical: enrichedAlerts.filter((alert) => alert.severity === "Crítico").length,
    operational: enrichedAlerts.filter((alert) => alert.category === "Operacional").length,
    financial: enrichedAlerts.filter((alert) => alert.category === "Financeiro").length,
  };

  return (
    <DashboardShell nav={ceoNav} active="Alertas" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader title="Alertas" description="Condições atuais que exigem atenção da gestão. Os alertas desaparecem quando a causa deixa de existir." />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Alertas ativos" value={counts.all} icon={BellRing} tone="blue" />
          <Metric label="Críticos" value={counts.critical} icon={Siren} tone="red" />
          <Metric label="Operacionais" value={counts.operational} icon={Wrench} tone="amber" />
          <Metric label="Financeiros" value={counts.financial} icon={CircleDollarSign} tone="green" />
        </section>

        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <Search className="size-4 shrink-0 text-slate-400" />
            <span className="sr-only">Buscar alerta</span>
            <input name="q" defaultValue={p.q} placeholder="Buscar alerta, placa ou unidade" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <select name="unit" defaultValue={selectedUnit} className={filterClass}>
            <option value="all">Todas as unidades</option>
            {d.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
          <select name="severity" defaultValue={severity} className={filterClass}>
            <option value="all">Todas as gravidades</option>
            <option value="Crítico">Críticos</option>
            <option value="Atenção">Atenção</option>
            <option value="Info">Informativos</option>
          </select>
          <input type="hidden" name="filter" value={filter} />
          <button className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Filtrar</button>
        </form>

        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit" aria-label="Categorias de alertas">
          <Tab href={tabHref("all", selectedUnit, severity, p.q)} active={filter === "all"} label="Todos" count={counts.all} />
          <Tab href={tabHref("operacional", selectedUnit, severity, p.q)} active={filter === "operacional"} label="Operacionais" count={counts.operational} />
          <Tab href={tabHref("financeiro", selectedUnit, severity, p.q)} active={filter === "financeiro"} label="Financeiros" count={counts.financial} />
          <Tab href={tabHref("critical", selectedUnit, severity, p.q)} active={filter === "critical"} label="Críticos" count={counts.critical} />
        </nav>

        <section className="space-y-3">
          {alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
          {!alerts.length ? (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-slate-200 bg-white px-6 text-center shadow-sm">
              <div><ShieldAlert className="mx-auto size-8 text-emerald-500" /><p className="mt-3 font-extrabold text-slate-950">Nenhum alerta com estes filtros</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou continue acompanhando a operação.</p></div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm"><AlertTriangle className="size-4.5" /></span><div><h2 className="font-extrabold text-slate-950">Regras monitoradas</h2><p className="mt-1 text-sm leading-6 text-slate-500">Sessões acima de 12h, pagamentos de estacionamento pendentes acima de 1h, ocupação a partir de 90%, diferenças de caixa, primeiro pagamento de mensalistas, mensalidades vencidas e falhas de geração mensal.</p></div></div>
        </section>
      </div>
    </DashboardShell>
  );
}

const filterClass = "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function enrichAlert(
  alert: CeoAlert,
  activeById: Map<string, { id: string; entered_at: string; plate_snapshot: string }>,
  planNames: Map<string, string | null>,
): CeoAlert {
  if (alert.id.startsWith("long-")) {
    const session = activeById.get(alert.id.slice("long-".length));
    if (session) {
      const minutes = Math.max(0, Math.floor((Date.now() - new Date(session.entered_at).getTime()) / 60000));
      return { ...alert, description: `${session.plate_snapshot} permanece no pátio há ${formatElapsed(minutes)}.` };
    }
  }

  if (alert.title.startsWith("Primeiro pagamento") && alert.href.startsWith("/ceo/mensalistas/")) {
    const subscriptionId = alert.href.split("/").pop() ?? "";
    const planName = planNames.get(subscriptionId);
    if (planName) return { ...alert, description: `${planName} · ${lowerFirst(alert.description)}` };
  }

  return alert;
}

function formatElapsed(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return `${hours}h ${String(rest).padStart(2, "0")}min`;
}
function lowerFirst(value: string) { return value ? value[0].toLowerCase() + value.slice(1) : value; }

function AlertCard({ alert }: { alert: CeoAlert }) {
  const critical = alert.severity === "Crítico";
  const info = alert.severity === "Info";
  const tone = critical ? "border-red-200 bg-red-50/60" : info ? "border-blue-200 bg-blue-50/50" : "border-amber-200 bg-amber-50/60";
  const badge = critical ? "bg-red-100 text-red-700" : info ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
  return <article className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>{alert.severity}</span><span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-600">{alert.category}</span></div>
        <h2 className="mt-3 text-lg font-extrabold text-slate-950">{alert.title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">{alert.unitName}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{alert.description}</p>
      </div>
      <Link href={alert.href} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-blue-600 shadow-sm ring-1 ring-slate-200 hover:bg-blue-50">
        {actionLabel(alert)} <ArrowUpRight className="size-4" />
      </Link>
    </div>
  </article>;
}

function actionLabel(alert: CeoAlert) {
  if (alert.href.startsWith("/ceo/sessoes/")) return "Ver sessão";
  if (alert.href.startsWith("/ceo/mensalistas/")) return alert.title.includes("Primeiro pagamento") ? "Abrir assinatura" : "Ver mensalistas";
  if (alert.href.startsWith("/ceo/financeiro")) return "Ver financeiro";
  if (alert.href.startsWith("/ceo/unidades")) return "Ver unidade";
  return "Abrir detalhe";
}
function tabHref(filter: FilterKey, unit: string, severity: SeverityKey, q?: string) { const params=new URLSearchParams();params.set("filter",filter);if(unit!=="all")params.set("unit",unit);if(severity!=="all")params.set("severity",severity);if(q?.trim())params.set("q",q.trim());return `/ceo/alertas?${params.toString()}`; }
function Tab({ href, active, label, count }: { href:string; active:boolean; label:string; count:number }) { return <Link href={href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${active?"bg-blue-600 text-white shadow-sm":"text-slate-600 hover:bg-slate-50"}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active?"bg-white/20 text-white":"bg-slate-100 text-slate-500"}`}>{count}</span></Link>; }
function Metric({ label, value, icon: Icon, tone }: { label:string; value:number; icon:typeof BellRing; tone:"blue"|"red"|"amber"|"green" }) { const palette={blue:"bg-blue-50 text-blue-600",red:"bg-red-50 text-red-600",amber:"bg-amber-50 text-amber-600",green:"bg-emerald-50 text-emerald-600"}[tone];return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${palette}`}><Icon className="size-4.5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p></div></div></article>; }
