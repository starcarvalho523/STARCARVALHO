"use client";

import { useState } from "react";

type Result = {
  processed: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;
  contractedAmount: number;
  dryRun: boolean;
};

export function MonthlyGenerationActions({ unitId }: { unitId: string }) {
  const [busy, setBusy] = useState<"dry" | "run" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "run");
    setError(null);
    try {
      const response = await fetch("/api/monthly-billing/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitId, dryRun }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "MONTHLY_AUTOMATION_FAILED");
      setResult(payload.result as Result);
      if (!dryRun) window.location.reload();
    } catch {
      setError("N\u00e3o foi poss\u00edvel executar a gera\u00e7\u00e3o agora.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-4">
      <h2 className="font-bold">Compet\u00eancias autom\u00e1ticas</h2>
      <p className="mt-1 text-sm text-slate-500">
        A pr\u00e9via n\u00e3o grava dados. A execu\u00e7\u00e3o gera somente compet\u00eancias do m\u00eas corrente.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => execute(true)} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy === "dry" ? "Calculando..." : "Pr\u00e9via (dry-run)"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => execute(false)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy === "run" ? "Executando..." : "Gerar agora"}
        </button>
      </div>
      {result ? <p className="mt-3 text-sm">Processadas: {result.processed} · Criadas: {result.created} · Existentes: {result.existing} · Ignoradas: {result.skipped} · Erros: {result.failed} · Valor contratado previsto: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(result.contractedAmount)}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
