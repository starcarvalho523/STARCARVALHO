import { FileSearch, History, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  employee_invited: "Convite de funcionário enviado",
  employee_unit_access_disabled: "Acesso à unidade bloqueado",
  employee_unit_access_reactivated: "Acesso à unidade reativado",
  employee_disabled: "Conta de funcionário bloqueada",
};

export default async function AuditPage() {
  const access = await requireCeoScope("audit");
  const supabase = await createClient();
  const unitIds = [...new Set(access.assignments.map((assignment) => String(assignment.unit_id)))];
  const [{ data: units }, { data: logs }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase
      .from("audit_logs")
      .select("id,unit_id,action,created_at")
      .in("unit_id", unitIds)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const unitNames = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const rows = logs ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((row) => String(row.created_at).slice(0, 10) === today).length;
  const invites = rows.filter((row) => row.action === "employee_invited").length;
  const blocks = rows.filter((row) => row.action === "employee_unit_access_disabled").length;

  return (
    <DashboardShell nav={ceoNav} active="Auditoria" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader
          title="Auditoria"
          description="Consulte eventos administrativos das unidades autorizadas. Esta área é somente leitura."
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Eventos carregados" value={String(rows.length)} icon={History} tone="blue" />
          <Metric label="Eventos hoje" value={String(todayCount)} icon={FileSearch} tone="slate" />
          <Metric label="Convites registrados" value={String(invites)} icon={UserPlus} tone="violet" />
          <Metric label="Bloqueios de acesso" value={String(blocks)} icon={ShieldOff} tone="amber" />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="size-4.5" /></span>
              <div>
                <h2 className="font-extrabold text-slate-950">Histórico administrativo</h2>
                <p className="mt-0.5 text-xs text-slate-500">Até 200 eventos mais recentes das suas unidades.</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Data e hora</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Evento</th><th className="px-5 py-3">Natureza</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-4 font-medium text-slate-800">{unitNames.get(row.unit_id) ?? "Unidade"}</td>
                    <td className="px-4 py-4 font-semibold text-slate-950">{actionLabels[row.action] ?? humanize(row.action)}</td>
                    <td className="px-5 py-4"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Somente leitura</span></td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={4} className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">Nenhum evento de auditoria encontrado</p><p className="mt-1 text-sm text-slate-500">Os eventos administrativos das unidades autorizadas aparecerão aqui.</p></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(value));
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof History; tone: "blue" | "slate" | "violet" | "amber" }) {
  const palette = { blue: "bg-blue-50 text-blue-600", slate: "bg-slate-100 text-slate-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600" }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${palette}`}><Icon className="size-4.5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p></div></div></article>;
}
