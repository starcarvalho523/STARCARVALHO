import { CircleDollarSign, FileSearch, History, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AuditCategory = "Operação" | "Financeiro" | "Mensalistas" | "Tarifas" | "Acessos" | "Sistema";
type AuditRow = {
  id: string;
  unit_id: string;
  actor_user_id: string | null;
  action: string;
  created_at: string;
};

const actionLabels: Record<string, string> = {
  "employee.invited": "Convite de funcionário enviado",
  employee_invited: "Convite de funcionário enviado",
  "employee.access_disabled": "Acesso à unidade bloqueado",
  employee_unit_access_disabled: "Acesso à unidade bloqueado",
  "employee.access_enabled": "Acesso à unidade reativado",
  employee_unit_access_reactivated: "Acesso à unidade reativado",
  employee_disabled: "Conta de funcionário bloqueada",
  "monthly.plan.created": "Plano mensal criado",
  "monthly.plan.updated": "Plano mensal atualizado",
  "monthly.subscription.created": "Assinatura mensal criada",
  "monthly.subscription.updated": "Assinatura mensal atualizada",
  "monthly.billing.created": "Cobrança mensal criada",
  "tariff.created": "Tarifa criada",
  "tariff.updated": "Tarifa atualizada",
  "cash.shift.opened": "Caixa aberto",
  "cash.shift.closed": "Caixa fechado",
  "parking.entry.created": "Entrada registrada",
  "parking.exit.started": "Saída iniciada",
  "parking.exit.completed": "Saída concluída",
  "payment.manual.confirmed": "Pagamento manual confirmado",
  "payment.created": "Pagamento registrado",
  "payment.updated": "Pagamento atualizado",
  "vehicle.created": "Veículo cadastrado",
  "vehicle.updated": "Veículo atualizado",
};

const categoryTone: Record<AuditCategory, string> = {
  Operação: "bg-blue-50 text-blue-700",
  Financeiro: "bg-emerald-50 text-emerald-700",
  Mensalistas: "bg-violet-50 text-violet-700",
  Tarifas: "bg-amber-50 text-amber-700",
  Acessos: "bg-rose-50 text-rose-700",
  Sistema: "bg-slate-100 text-slate-700",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; unit?: string; category?: string; period?: string }>;
}) {
  const query = await searchParams;
  const access = await requireCeoScope("audit");
  const admin = createAdminClient();
  const unitIds = [...new Set(access.assignments.map((assignment) => String(assignment.unit_id)))];
  const selectedUnit = query.unit && unitIds.includes(query.unit) ? query.unit : "all";
  const period = ["7", "30", "90", "all"].includes(query.period ?? "") ? String(query.period) : "30";
  const scopedUnitIds = selectedUnit === "all" ? unitIds : [selectedUnit];

  const { data: units } = unitIds.length
    ? await admin.from("parking_units").select("id,name").in("id", unitIds).order("name")
    : { data: [] };

  let rows: AuditRow[] = [];
  if (scopedUnitIds.length) {
    let logsQuery = admin
      .from("audit_logs")
      .select("id,unit_id,actor_user_id,action,created_at")
      .in("unit_id", scopedUnitIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (period !== "all") {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - Number(period));
      logsQuery = logsQuery.gte("created_at", since.toISOString());
    }
    const { data: logs } = await logsQuery;
    rows = (logs ?? []) as AuditRow[];
  }

  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("id,full_name").in("id", actorIds)
    : { data: [] };

  const unitNames = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const actorNames = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
  const normalizedQ = (query.q ?? "").trim().toLowerCase();
  const selectedCategory = isCategory(query.category) ? query.category : "all";

  const filtered = rows.filter((row) => {
    const category = categoryForAction(row.action);
    const label = labelForAction(row.action, category);
    const actor = row.actor_user_id ? actorNames.get(row.actor_user_id) ?? "Usuário identificado" : "Sistema";
    const haystack = `${label} ${actor} ${unitNames.get(row.unit_id) ?? ""}`.toLowerCase();
    return (
      (selectedCategory === "all" || category === selectedCategory) &&
      (!normalizedQ || haystack.includes(normalizedQ))
    );
  });

  const todayKey = localDateKey(new Date());
  const todayCount = filtered.filter((row) => localDateKey(new Date(row.created_at)) === todayKey).length;
  const accessChanges = filtered.filter((row) => categoryForAction(row.action) === "Acessos").length;
  const financialEvents = filtered.filter((row) => categoryForAction(row.action) === "Financeiro").length;

  return (
    <DashboardShell nav={ceoNav} active="Auditoria" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader
          title="Auditoria"
          description="Consulte eventos das unidades autorizadas. Esta área é somente leitura."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Eventos no período" value={String(filtered.length)} icon={History} tone="blue" />
          <Metric label="Eventos hoje" value={String(todayCount)} icon={FileSearch} tone="slate" />
          <Metric label="Alterações de acesso" value={String(accessChanges)} icon={ShieldOff} tone="amber" />
          <Metric label="Eventos financeiros" value={String(financialEvents)} icon={CircleDollarSign} tone="green" />
        </section>

        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <Search className="size-4 shrink-0 text-slate-400" />
            <span className="sr-only">Buscar evento ou responsável</span>
            <input name="q" defaultValue={query.q} placeholder="Buscar evento ou responsável" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <select name="unit" defaultValue={selectedUnit} className={filterClass}>
            <option value="all">Todas as unidades</option>
            {(units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
          <select name="category" defaultValue={selectedCategory} className={filterClass}>
            <option value="all">Todas as categorias</option>
            <option value="Operação">Operação</option>
            <option value="Financeiro">Financeiro</option>
            <option value="Mensalistas">Mensalistas</option>
            <option value="Tarifas">Tarifas</option>
            <option value="Acessos">Acessos</option>
            <option value="Sistema">Sistema</option>
          </select>
          <select name="period" defaultValue={period} className={filterClass}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todo o histórico carregado</option>
          </select>
          <button className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Filtrar</button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="size-4.5" /></span>
              <div>
                <h2 className="font-extrabold text-slate-950">Histórico de auditoria</h2>
                <p className="mt-0.5 text-xs text-slate-500">Até 500 eventos recentes, limitados às unidades e ao período selecionados.</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Data e hora</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-5 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const category = categoryForAction(row.action);
                  const actor = row.actor_user_id ? actorNames.get(row.actor_user_id) ?? "Usuário identificado" : "Sistema";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-4 text-slate-600">{formatDateTime(row.created_at)}</td>
                      <td className="px-4 py-4 font-medium text-slate-800">{unitNames.get(row.unit_id) ?? "Unidade"}</td>
                      <td className="px-4 py-4 font-semibold text-slate-950">{labelForAction(row.action, category)}</td>
                      <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${categoryTone[category]}`}>{category}</span></td>
                      <td className="px-5 py-4 text-slate-600">{actor}</td>
                    </tr>
                  );
                })}
                {!filtered.length ? <tr><td colSpan={5} className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">Nenhum evento encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros para ampliar a consulta.</p></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

const filterClass = "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function isCategory(value?: string): value is AuditCategory {
  return ["Operação", "Financeiro", "Mensalistas", "Tarifas", "Acessos", "Sistema"].includes(value ?? "");
}

function categoryForAction(value: string): AuditCategory {
  const action = value.toLowerCase();
  if (action.startsWith("employee") || action.includes("access") || action.startsWith("auth")) return "Acessos";
  if (action.startsWith("payment") || action.startsWith("cash") || action.includes("finance") || action.includes("billing")) return "Financeiro";
  if (action.startsWith("monthly")) return "Mensalistas";
  if (action.startsWith("tariff")) return "Tarifas";
  if (action.startsWith("parking") || action.startsWith("vehicle") || action.startsWith("terminal")) return "Operação";
  return "Sistema";
}

function labelForAction(action: string, category: AuditCategory) {
  if (actionLabels[action]) return actionLabels[action];
  const fallback: Record<AuditCategory, string> = {
    Operação: "Evento operacional registrado",
    Financeiro: "Evento financeiro registrado",
    Mensalistas: "Evento de mensalistas registrado",
    Tarifas: "Alteração de tarifa registrada",
    Acessos: "Alteração de acesso registrada",
    Sistema: "Evento do sistema registrado",
  };
  return fallback[category];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(value));
}

function localDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof History; tone: "blue" | "slate" | "amber" | "green" }) {
  const palette = { blue: "bg-blue-50 text-blue-600", slate: "bg-slate-100 text-slate-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${palette}`}><Icon className="size-4.5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p></div></div></article>;
}
