"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function LivePlateSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
    if (normalized === initialQuery) return;

    const timer = window.setTimeout(() => {
      router.replace(normalized ? `/frentista/saidas?q=${encodeURIComponent(normalized)}` : "/frentista/saidas", {
        scroll: false,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [value, initialQuery, router]);

  return (
    <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50">
      <Search className="size-4 shrink-0 text-slate-400" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))}
        placeholder="Buscar por placa"
        aria-label="Buscar veículo por placa"
        autoComplete="off"
        inputMode="text"
        className="min-w-0 flex-1 bg-transparent text-sm uppercase outline-none placeholder:normal-case"
      />
    </label>
  );
}
