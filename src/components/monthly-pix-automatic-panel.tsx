"use client";

import Image from "next/image";
import { Check, Copy, LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type View = {
  state: "PENDING" | "ACTIVE" | "PAID" | "SUSPENDED" | "REFUSED" | "EXPIRED";
  amount: number;
  qrCodePayload: string | null;
  qrCodeImageBase64: string | null;
  expiresAt: string | null;
};

export function MonthlyPixAutomaticPanel({ billingPeriodId }: { billingPeriodId: string }) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (response: Response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível iniciar o Pix Automático.");
    if (!body.payment || typeof body.payment !== "object") return null;
    const item = body.payment as View;
    setView(item);
    setError(null);
    if (item.state === "PAID") router.refresh();
    return item;
  }, [router]);

  const create = async () => {
    setLoading(true);setError(null);
    try {
      await read(await fetch("/api/payments/monthly/pix-automatic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingPeriodId }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o Pix Automático.");
    } finally { setLoading(false); }
  };

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const result = await read(await fetch(`/api/payments/monthly/pix-automatic?billingPeriodId=${encodeURIComponent(billingPeriodId)}`, { cache: "no-store" }));
      if (!result && !silent) setError("Nenhuma autorização encontrada para esta mensalidade.");
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o Pix Automático.");
    } finally { if (!silent) setRefreshing(false); }
  }, [billingPeriodId, read]);

  useEffect(() => {
    if (!view || !["PENDING", "ACTIVE"].includes(view.state)) return;
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, view]);

  if (!view) return <div>
    <button type="button" onClick={() => void create()} disabled={loading} className="flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : <QrCode className="size-5" />}
      {loading ? "Criando autorização..." : "Pix Automático"}
    </button>
    {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
  </div>;

  const imageSource = view.qrCodeImageBase64
    ? view.qrCodeImageBase64.startsWith("data:image/") ? view.qrCodeImageBase64 : `data:image/png;base64,${view.qrCodeImageBase64}`
    : null;
  const terminal = ["PAID", "SUSPENDED", "REFUSED", "EXPIRED"].includes(view.state);
  const label = view.state === "PAID" ? "Mensalidade ativa"
    : view.state === "ACTIVE" ? "Autorização ativa — confirmando competência"
    : view.state === "PENDING" ? "Aguardando pagamento e autorização"
    : view.state === "REFUSED" ? "Autorização recusada"
    : view.state === "EXPIRED" ? "Autorização expirada"
    : "Autorização suspensa";

  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:col-span-3 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold">Pix Automático</h3><p className="mt-1 text-sm text-slate-600">Autorize uma vez para renovar a mensalidade automaticamente.</p><p className="mt-1 text-2xl font-bold text-emerald-700">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(view.amount)}</p></div>
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{label}</span>
    </div>
    {!terminal ? <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <div className="grid min-h-48 place-items-center rounded-xl border bg-white p-3">{imageSource ? <Image unoptimized src={imageSource} alt="QR Code de autorização Pix Automático" width={184} height={184} className="size-44" /> : <p className="text-center text-xs text-slate-500">QR Code indisponível.</p>}</div>
      <div className="min-w-0 space-y-3"><textarea readOnly value={view.qrCodePayload ?? ""} rows={5} className="w-full resize-none rounded-xl border bg-white p-3 text-xs outline-none" /><button type="button" disabled={!view.qrCodePayload} onClick={async()=>{if(!view.qrCodePayload)return;await navigator.clipboard.writeText(view.qrCodePayload);setCopied(true);window.setTimeout(()=>setCopied(false),2000)}} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{copied?"Código copiado":"Copiar código"}</button></div>
    </div> : null}
    <button type="button" onClick={() => void refresh()} disabled={refreshing} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border bg-white text-sm font-bold text-blue-600 disabled:opacity-50"><RefreshCw className={`size-4 ${refreshing?"animate-spin":""}`}/>{refreshing?"Verificando...":"Atualizar estado"}</button>
    {error ? <p role="alert" className="text-xs font-semibold text-red-600">{error}</p> : null}
  </section>;
}
