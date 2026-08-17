import { Lightbulb } from "lucide-react";
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
      <div>
        <h1 className="text-3xl font-bold">Registrar entrada</h1>
        <p className="mt-1 text-sm text-slate-500">A placa, o horário oficial, a tarifa e o operador serão registrados automaticamente.</p>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <EntryForm carEnabled={data.has_active_car_tariff} motorcycleEnabled={data.has_active_motorcycle_tariff}/>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-bold text-slate-950">Entradas recentes no pátio</h2>
            <p className="mt-0.5 text-xs text-slate-500">Veículos que ainda estão em atendimento na unidade.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500"/>{data.active_sessions.length} {data.active_sessions.length===1?"veículo no pátio":"veículos no pátio"}</span>
        </div>
        <OperatorSessionTable sessions={data.active_sessions} timezone={data.unit.timezone}/>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-800">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-blue-600"/>
        <p><b>Dica:</b> confirme a placa e o tipo do veículo antes de registrar a entrada para evitar cobranças incorretas.</p>
      </div>
    </div>
  </DashboardShell>;
}
