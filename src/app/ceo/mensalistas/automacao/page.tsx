import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { DashboardShell } from "@/components/dashboard-shell";
import { MonthlyGenerationActions } from "@/components/monthly-generation-actions";
import { ceoNav } from "@/lib/ceo-nav";
import { formatMoney } from "@/lib/operator-format";
import { getMonthlyAccess } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MonthlyAutomationPage() {
  const { unitIds, manageableUnitIds } = await getMonthlyAccess();
  const supabase = await createClient();
  const [{ data: units }, { data: periods }, { data: runs }, { data: incidents }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase.from("monthly_billing_periods").select("unit_id,status,due_date,grace_until,amount").in("unit_id", unitIds),
    supabase.from("monthly_billing_generation_runs").select("id,unit_id,source,target_date,processed_count,created_count,existing_count,skipped_count,failed_count,contracted_amount,finished_at").in("unit_id", unitIds).order("started_at", { ascending: false }).limit(100),
    supabase.rpc("list_monthly_automation_incidents_for_actor"),
  ]);
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const sevenDaysAhead = new Date(todayDate.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const pending = (periods ?? []).filter((period) => period.status === "PENDING");
  const dueSoon = pending.filter((period) => period.due_date >= today && period.due_date <= sevenDaysAhead);
  const inGrace = pending.filter((period) => period.due_date < today && period.grace_until >= today);
  const overdue = pending.filter((period) => period.grace_until < today);
  const latestByUnit = new Map<string, any>();
  for (const run of runs ?? []) if (!latestByUnit.has(run.unit_id)) latestByUnit.set(run.unit_id, run);
  const unitMap = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const automationEnabled = process.env.MONTHLY_BILLING_AUTOMATION_ENABLED === "true";

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-6xl space-y-5">
        <CeoPageHeader title="Automação de mensalidades" description="Geração, pagamentos, reconciliação, avisos, carência, suspensão e reativação em um único fluxo diário.">
          <Link href="/ceo/mensalistas" className="rounded-xl border px-4 py-2 text-sm font-semibold text-blue-700">Voltar aos mensalistas</Link>
        </CeoPageHeader>

        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${automationEnabled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          {automationEnabled ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-5 text-amber-600" />}
          <div><p className="font-bold text-slate-950">Automação {automationEnabled ? "ativada" : "desativada"}</p><p className="mt-1 text-sm text-slate-600">Execução diária programada para 07:00 no horário da Bahia. Com a flag desligada, o cron não altera cobranças nem contratos.</p></div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="A vencer em 7 dias" value={dueSoon.length} />
          <Metric label="Em carência" value={inGrace.length} />
          <Metric label="Inadimplentes" value={overdue.length} />
          <Metric label="Competências pendentes" value={pending.length} />
          <Metric label="Incidentes abertos" value={(incidents ?? []).length} />
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Incidentes que precisam de atenção</h2><p className="mt-1 text-sm text-slate-500">Só permanecem aqui falhas que a automação ainda não conseguiu resolver sozinha.</p></div></div>
          <div className="mt-3 space-y-2">
            {(incidents ?? []).map((incident: any) => <div key={incident.id} className={`rounded-xl border p-3 ${incident.severity === "CRITICAL" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><div className="flex flex-wrap items-center gap-2"><b className="text-slate-950">{incident.code}</b><span className="text-xs font-semibold text-slate-500">{unitMap.get(incident.unit_id) ?? "Unidade"}</span><span className="text-xs text-slate-500">ocorrências: {incident.occurrences}</span></div><p className="mt-1 text-sm text-slate-600">{incident.summary}</p></div>)}
            {!(incidents ?? []).length ? <div className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">Nenhum incidente aberto. A automação não exige ação do CEO neste momento.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">Últimas execuções</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(units ?? []).map((unit) => {
              const run = latestByUnit.get(unit.id);
              return <div key={unit.id} className="rounded-xl bg-slate-50 p-3"><b>{unit.name}</b>{run ? <span className="ml-2 text-slate-600">{run.source} · criadas {run.created_count} · existentes {run.existing_count} · ignoradas {run.skipped_count} · erros {run.failed_count} · {formatMoney(run.contracted_amount)} · {run.finished_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(run.finished_at)) : "em andamento"}</span> : <span className="ml-2 text-slate-500">Nenhuma execução registrada.</span>}</div>;
            })}
          </div>
        </section>
        {manageableUnitIds.map((unitId) => <MonthlyGenerationActions key={unitId} unitId={unitId} />)}
      </div>
    </DashboardShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-2xl border bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></article>;
}
