"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useGlobalRouter as useRouter } from "@/components/global-loading-provider";
import { CalendarRange, Building2 } from "lucide-react";

export function StrategyFilters({ units }: { units: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete("erro");
    next.delete("sucesso");
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative">
        <span className="sr-only">Período</span>
        <CalendarRange className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <select
          value={params.get("period") ?? "30"}
          onChange={(event) => setFilter("period", event.target.value)}
          className="h-10 min-w-40 rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        >
          <option value="today">Hoje</option>
          <option value="7">7 dias</option>
          <option value="30">30 dias</option>
          <option value="90">3 meses</option>
          <option value="180">6 meses</option>
          <option value="365">1 ano</option>
          <option value="all">Todo o período</option>
        </select>
      </label>

      <label className="relative">
        <span className="sr-only">Unidade</span>
        <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <select
          value={params.get("unit") ?? "all"}
          onChange={(event) => setFilter("unit", event.target.value)}
          className="h-10 min-w-48 rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        >
          <option value="all">Todas as unidades</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </label>
    </div>
  );
}
