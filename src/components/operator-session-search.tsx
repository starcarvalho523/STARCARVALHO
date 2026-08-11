"use client";
import { useMemo, useState } from "react";
import { OperatorSessionTable } from "@/components/operator-session-table";
import type { ActiveSession } from "@/lib/operator-format";

export function OperatorSessionSearch({sessions,timezone}:{sessions:ActiveSession[];timezone:string}) {
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("ALL");
  const rows=useMemo(()=>sessions.filter((item)=>item.plate.includes(query.toUpperCase().replace(/[^A-Z0-9]/g,""))&&(status==="ALL"||item.status===status)),[sessions,query,status]);
  return <div><div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_240px]"><input aria-label="Buscar veículo por placa" type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar por placa" className="h-11 rounded-xl border px-4 uppercase outline-none focus:border-blue-500"/><select aria-label="Filtrar por status" value={status} onChange={(event)=>setStatus(event.target.value)} className="h-11 rounded-xl border bg-white px-4"><option value="ALL">Todos os status</option><option value="OPEN">Estacionados</option><option value="PAYMENT_PENDING">Aguardando pagamento</option><option value="PAID">Prontos para saída</option><option value="MANUAL_REVIEW">Em revisão</option></select></div><OperatorSessionTable sessions={rows} timezone={timezone}/></div>;
}
