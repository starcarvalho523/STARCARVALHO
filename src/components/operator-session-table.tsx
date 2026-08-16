import Link from "next/link";
import { ArrowRight,CalendarDays,CarFront,CircleDollarSign,Clock3,Play } from "lucide-react";
import { OperationBadge } from "@/components/operation-badge";
import { formatDateTime,formatDuration,formatMoney,sessionParkingStatus,type ActiveSession } from "@/lib/operator-format";

export function OperatorSessionTable({sessions,timezone,limit}:{sessions:ActiveSession[];timezone:string;limit?:number}){
  const rows=limit?sessions.slice(0,limit):sessions;
  if(!rows.length)return <div className="flex items-center justify-center gap-3 p-8 text-sm text-slate-500"><span className="grid size-10 place-items-center rounded-full bg-slate-100"><CarFront className="size-5 text-slate-400"/></span><span>Nenhum veículo estacionado no momento.</span></div>;

  return <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-5 py-3">Placa</th>
            <th className="px-3 py-3">Entrada</th>
            <th className="px-3 py-3">Permanência</th>
            <th className="px-3 py-3">Valor atual</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-5 py-3 text-right">Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s=>{
            const status=sessionParkingStatus(s.status,s.entry_mode,s.financial_obligation);
            const open=s.status==="OPEN";
            return <tr key={s.id} className="border-t border-slate-100 transition hover:bg-slate-50/60">
              <td className="px-5 py-4">
                <span className="flex items-center gap-2 font-bold text-blue-600"><CarFront className="size-4 text-slate-500"/>{s.plate}</span>
              </td>
              <td className="px-3 py-4"><span className="flex items-center gap-2 text-slate-700"><CalendarDays className="size-4 text-slate-400"/>{formatDateTime(s.entered_at,timezone)}</span></td>
              <td className="px-3 py-4"><span className="flex items-center gap-2 font-medium text-slate-800"><Clock3 className="size-4 text-slate-400"/>{formatDuration(s.duration_minutes)}</span></td>
              <td className="px-3 py-4"><span className="flex items-center gap-2 font-medium text-slate-800"><CircleDollarSign className="size-4 text-emerald-600"/>{formatMoney(s.amount)}</span></td>
              <td className="px-3 py-4"><OperationBadge {...status}/></td>
              <td className="px-5 py-4 text-right">
                <Link className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${open?"bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700":"border border-slate-200 bg-white text-blue-600 hover:border-blue-200 hover:bg-blue-50"}`} href={`/frentista/saidas?session=${s.id}`}>
                  {open?<Play className="size-4 fill-current"/>:<ArrowRight className="size-4"/>}
                  {open?"Iniciar saída":"Abrir sessão"}
                </Link>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/40 px-5 py-3 text-xs text-slate-500">
      <span>Exibindo {rows.length} de {sessions.length} {sessions.length===1?"veículo":"veículos"}</span>
      <span>Dados atuais da unidade</span>
    </div>
  </>;
}
