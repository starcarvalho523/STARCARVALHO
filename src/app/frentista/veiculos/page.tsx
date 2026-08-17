import { DashboardShell } from "@/components/dashboard-shell";
import { OperatorSessionSearch } from "@/components/operator-session-search";
import { getOperatorDashboard } from "@/lib/operator-data";
import { operatorNav } from "@/lib/operator-nav";

export const dynamic="force-dynamic";

export default async function VehiclesPage(){
  const data=await getOperatorDashboard();
  return <DashboardShell nav={operatorNav} active="Veículos" role="Frentista">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Veículos no pátio</h1>
          <p className="text-sm text-slate-500">Acompanhe os veículos ocupando vagas e sua situação operacional.</p>
        </div>
        <p className="text-xs text-slate-400">Dados atuais da unidade</p>
      </div>
      <OperatorSessionSearch sessions={data.active_sessions} timezone={data.unit.timezone} capacity={data.unit.capacity}/>
    </div>
  </DashboardShell>;
}
