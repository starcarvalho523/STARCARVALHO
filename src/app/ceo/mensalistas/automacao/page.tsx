import Link from "next/link";
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
  const [{ data: units }, { data: periods }, { data: runs }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase.from("monthly_billing_periods").select("unit_id,status,due_date,grace_until,amount").in("unit_id", unitIds),
    supabase.from("monthly_billing_generation_runs").select("id,unit_id,source,target_date,processed_count,created_count,existing_count,skipped_count,failed_count,contracted_amount,finished_at").in("unit_id", unitIds).order("started_at", { ascending: false }).limit(100),
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

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-6xl space-y-5">
        <CeoPageHeader title="Automa\u00e7\u00e3o de compet\u00eancias" description="Gera apenas a compet\u00eancia do m\u00eas corrente para contratos ativos. N\u00e3o cria pagamentos.">
          <Link href="/ceo/mensalistas" className="rounded-xl border px-4 py-2 text-sm font-semibold text-blue-700">Voltar aos mensalistas</Link>
        </CeoPageHeader>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="A vencer em 7 dias" value={dueSoon.length} />
          <Metric label="Em car\u00eancia" value={inGrace.length} />
          <Metric label="Inadimplentes" value={overdue.length} />
          <Metric label="Compet\u00eancias pendentes" value={pending.length} />
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">\u00daltimas execu\u00e7\u00f5es</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(units ?? []).map((unit) => {
              const run = latestByUnit.get(unit.id);
              return <div key={unit.id} className="rounded-xl bg-slate-50 p-3"><b>{unit.name}</b>{run ? <span className="ml-2 text-slate-600">{run.source} · criadas {run.created_count} · existentes {run.existing_count} · ignoradas {run.skipped_count} · erros {run.failed_count} · {formatMoney(run.contracted_amount)} · {run.finished_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(run.finished_at)) : "em andamento"}</span> : <span className="ml-2 text-slate-500">Nenhuma execu\u00e7\u00e3o registrada.</span>}</div>;
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
