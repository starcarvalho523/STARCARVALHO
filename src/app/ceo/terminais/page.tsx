import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Terminal = { id:string; unit_id:string; name:string; status:string; operating_mode:string|null; enabled:boolean };

export default async function TerminalsPage(){
  const supabase=await createClient();
  const [{data:units},{data:terminals}]=await Promise.all([
    supabase.from("parking_units").select("id,name").order("name"),
    supabase.from("payment_terminals").select("id,unit_id,name,status,operating_mode,enabled").eq("provider","MERCADO_PAGO").order("name"),
  ]);
  const terminalRows=(terminals??[]) as Terminal[];
  return <DashboardShell nav={ceoNav} active="Terminais" role="CEO"><div className="mx-auto max-w-6xl space-y-5">
    <CeoPageHeader title="Terminais de pagamento" description="PreparaÃ§Ã£o administrativa por unidade. Nenhuma cobranÃ§a Point estÃ¡ habilitada."/>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-900">Mercado Pago Point</h2><p className="mt-1 text-sm text-amber-800">Status: aguardando configuraÃ§Ã£o e homologaÃ§Ã£o com terminal fÃ­sico.</p><p className="mt-3 text-sm text-slate-700">A integraÃ§Ã£o permitirÃ¡ enviar o valor oficial da estadia Ã  maquininha e receber a confirmaÃ§Ã£o do pagamento. Nesta fase nÃ£o hÃ¡ botÃ£o de cobranÃ§a nem comunicaÃ§Ã£o com o Mercado Pago.</p></section>
    <div className="grid gap-4 lg:grid-cols-2">{(units??[]).map(unit=>{const list=terminalRows.filter(t=>t.unit_id===unit.id);return <section key={unit.id} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">{unit.name}</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><Item label="Terminal" value={list.length?list.map(t=>t.name).join(", "):"NÃ£o conectado"}/><Item label="Modo PDV" value={list.some(t=>t.operating_mode==="PDV")?"Identificado, ainda desabilitado":"NÃ£o configurado"}/><Item label="DÃ©bito presencial" value="IndisponÃ­vel"/><Item label="CrÃ©dito presencial" value="IndisponÃ­vel"/></dl></section>})}</div>
  </div></DashboardShell>;
}

function Item({label,value}:{label:string;value:string}){return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>}

