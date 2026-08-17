import { CircleDollarSign } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { getMonthlyAccess, money } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";
import { togglePlan } from "../actions";
import { MonthlyTabs, Notice, secondary } from "../ui";
import { NewPlanModal } from "./new-plan-modal";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; novo?: string }>;
}) {
  const note = await searchParams;
  const { unitIds, manageableUnitIds, canManage } = await getMonthlyAccess();
  const supabase = await createClient();
  const [{ data: units }, { data: plans }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase.from("monthly_plans").select("*").in("unit_id", unitIds).order("created_at", {
      ascending: false,
    }),
  ]);
  const unitMap = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const activePlans = (plans ?? []).filter((plan) => plan.enabled).length;
  const manageableUnits = (units ?? []).filter((unit) => manageableUnitIds.includes(unit.id));

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader
          title="Mensalistas"
          description="Gestão de contratos, planos e cobranças recorrentes."
        >
          {canManage ? <NewPlanModal units={manageableUnits} defaultOpen={note.novo === "1"} /> : null}
        </CeoPageHeader>

        <MonthlyTabs active="plans" />
        <Notice error={note.erro} success={note.sucesso} />

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Planos de mensalistas</h2>
          <p className="mt-1 text-sm text-slate-500">
            {plans?.length ?? 0} plano(s) cadastrado(s), {activePlans} ativo(s). Condições de contratos existentes permanecem congeladas.
          </p>
        </section>

        <div className="flex flex-wrap gap-4">
          {(plans ?? []).map((plan) => (
            <article
              key={plan.id}
              className="flex w-full max-w-[520px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                    {unitMap.get(plan.unit_id)}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">{plan.name}</h3>
                  <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                    {plan.description || "Sem descrição"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                    plan.enabled
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
                      : "bg-slate-100 text-slate-600 ring-slate-500/10"
                  }`}
                >
                  {plan.enabled ? "Ativo" : "Desativado"}
                </span>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <CircleDollarSign className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">Mensalidade</p>
                    <p className="text-2xl font-extrabold tracking-tight text-slate-950">
                      {money(plan.price)}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Item label="Vencimento" value={`Dia ${plan.due_day_default}`} />
                <Item label="Tolerância" value={`${plan.grace_days} dias`} />
                <Item label="Veículos" value={`Até ${plan.max_vehicles}`} />
                <Item label="Situação" value={plan.enabled ? "Disponível para novos contratos" : "Fora de oferta"} />
              </dl>

              {manageableUnitIds.includes(plan.unit_id) ? (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <form action={togglePlan}>
                    <input type="hidden" name="unitId" value={plan.unit_id} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="enabled" value={String(!plan.enabled)} />
                    <button className={secondary}>
                      {plan.enabled ? "Desativar plano" : "Reativar plano"}
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          ))}
          {!plans?.length ? (
            <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="font-semibold text-slate-700">Nenhum plano cadastrado</p>
              <p className="mt-1 text-sm text-slate-500">
                Crie o primeiro plano para habilitar novas assinaturas.
              </p>
            </div>
          ) : null}
        </div>

        {!canManage ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Seu perfil possui acesso somente para consulta.
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
