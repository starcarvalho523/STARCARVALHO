import { CarFront, Clock3 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EntryForm } from "@/components/entry-form";
import { OperatorSessionTable } from "@/components/operator-session-table";
import { getOperatorDashboard } from "@/lib/operator-data";
import { operatorNav } from "@/lib/operator-nav";

export const dynamic="force-dynamic";

export default async function EntriesPage(){
  const data=await getOperatorDashboard();
  return <DashboardShell nav={operatorNav} active="Entradas" role="Frentista">
    <div className="mx-auto max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Registrar entrada</h1>
          <p className="mt-1 text-sm text-slate-500">A placa, o horário oficial, a tarifa e o operador serão registrados automaticamente.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
          <Clock3 className="size-4 text-blue-600"/>
          Registro operacional em tempo real
        </div>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><CarFront className="size-5"/></span>
          <div>
            <h2 className="font-bold text-slate-950">Nova entrada</h2>
            <p className="text-xs text-slate-500">Digite a placa, confirme o tipo do veículo e registre a entrada.</p>
          </div>
        </div>
        <EntryForm carEnabled={data.has_active_car_tariff} motorcycleEnabled={data.has_active_motorcycle_tariff}/>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-bold text-slate-950">Entradas recentes no pátio</h2>
            <p className="mt-0.5 text-xs text-slate-500">Veículos que ainda estão em atendimento na unidade.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{data.active_sessions.length} {data.active_sessions.length===1?"veículo":"veículos"}</span>
        </div>
        <OperatorSessionTable sessions={data.active_sessions} timezone={data.unit.timezone}/>
      </section>
    </div>
  </DashboardShell>;
}
