"use client";
import { useMemo, useState } from "react";
import { formatSubscriptionStatus } from "@/lib/operator-format";

export type MonthlySearchRow = { id:string; plate:string; planName:string; status:string; expiresAt:string };

export function MonthlySearch({ rows }: { rows:MonthlySearchRow[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const filtered = useMemo(() => rows.filter((row) => row.plate.includes(normalizedQuery)), [normalizedQuery, rows]);
  return <><input aria-label="Buscar mensalista por placa" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por placa" className="h-12 w-full rounded-xl border px-4 uppercase outline-none focus:border-blue-500"/><div className="mt-4 space-y-2">{filtered.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border p-4 sm:grid-cols-4"><b>{item.plate}</b><span>{item.planName}</span><span className="font-semibold">{formatSubscriptionStatus(item.status)}</span><span className="text-sm text-slate-500">Até {item.expiresAt}</span></div>)}{filtered.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhum mensalista encontrado nesta unidade.</p> : null}</div></>;
}

