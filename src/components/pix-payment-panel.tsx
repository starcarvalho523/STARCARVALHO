"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type PixCharge = {
  state: "CREATING" | "RECONCILING" | "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "RECONCILIATION_FAILED";
  amount: number;
  qrCodePayload: string | null;
  qrCodeImageBase64: string | null;
  expiresAt: string | null;
};

type PixResponse = { payment?: unknown; error?: unknown };

const errorMessages: Record<string, string> = {
  PAYMENT_NOT_AVAILABLE: "Esta sessão não está disponível para pagamento via PIX.",
  PAYMENTS_SANDBOX_UNAVAILABLE: "O serviço PIX está temporariamente indisponível. Tente novamente em instantes.",
  PAYMENT_REQUEST_FAILED: "Não foi possível solicitar a cobrança PIX. Tente novamente.",
};

export function PixPaymentPanel({ sessionId, billingPeriodId, resumeExisting=false, onPaid }: { sessionId?: string; billingPeriodId?: string; resumeExisting?: boolean; onPaid?: () => void }) {
  const router = useRouter();
  const paidHandled = useRef(false);
  const expiring = useRef(false);
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readResponse = useCallback(async (response: Response) => {
    const body = (await response.json().catch(() => ({}))) as PixResponse;
    if (!response.ok) {
      const code = typeof body.error === "string" ? body.error : "PAYMENT_REQUEST_FAILED";
      throw new Error(errorMessages[code] ?? (typeof body.error === "string" ? body.error : errorMessages.PAYMENT_REQUEST_FAILED));
    }
    if (billingPeriodId && (body.payment === null || body.payment === undefined)) {
      setCharge(null);
      setError(null);
      router.refresh();
      return null;
    }
    const parsed = parseCharge(body.payment);
    if (!parsed) throw new Error(errorMessages.PAYMENT_REQUEST_FAILED);
    setCharge(parsed);
    setError(null);
    if (parsed.state === "PAID" && !paidHandled.current) {
      paidHandled.current = true;
      router.refresh();
      onPaid?.();
    }
    return parsed;
  }, [billingPeriodId,onPaid, router]);

  const createCharge = useCallback(async () => {
    setLoading(true);
    setError(null);
    expiring.current=false;
    try {
      const monthly=Boolean(billingPeriodId);
      await readResponse(await fetch(monthly?"/api/payments/monthly/pix":"/api/payments/efi-pix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(monthly?{billingPeriodId}:{sessionId}),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errorMessages.PAYMENT_REQUEST_FAILED);
    } finally {
      setLoading(false);
    }
  },[billingPeriodId,readResponse,sessionId]);

  const refreshCharge = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const monthly = Boolean(billingPeriodId);
      if (monthly) {
        await readResponse(await fetch(`/api/payments/monthly/pix?billingPeriodId=${encodeURIComponent(billingPeriodId ?? "")}`, { cache: "no-store" }));
      } else {
        await readResponse(await fetch("/api/payments/efi-pix/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) }));
      }
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : errorMessages.PAYMENT_REQUEST_FAILED);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [billingPeriodId,readResponse, sessionId]);

  const expireMonthlyCharge = useCallback(async () => {
    if (!billingPeriodId || expiring.current) return;
    expiring.current=true;
    try {
      const response=await fetch(`/api/payments/monthly/pix?billingPeriodId=${encodeURIComponent(billingPeriodId)}`,{method:"DELETE",cache:"no-store"});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Não foi possível encerrar o PIX expirado.");
      setCharge((current)=>current?{...current,state:"EXPIRED"}:current);
      setRemainingSeconds(0);
      router.refresh();
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Não foi possível encerrar o PIX expirado.");
    }finally{
      expiring.current=false;
    }
  },[billingPeriodId,router]);

  useEffect(() => {
    if (charge?.state !== "CREATING" && charge?.state !== "PENDING") return;
    const timer = window.setInterval(() => void refreshCharge(true), 5000);
    return () => window.clearInterval(timer);
  }, [charge?.state, refreshCharge]);

  useEffect(()=>{
    if(!billingPeriodId||charge?.state!=="PENDING"||!charge.expiresAt)return;
    const update=()=>{
      const expiresAt=new Date(charge.expiresAt ?? "").getTime();
      if(!Number.isFinite(expiresAt)){setRemainingSeconds(null);return;}
      const seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));
      setRemainingSeconds(seconds);
      if(seconds===0)void expireMonthlyCharge();
    };
    const initialTimer=window.setTimeout(update,0);
    const timer=window.setInterval(update,1000);
    return()=>{window.clearTimeout(initialTimer);window.clearInterval(timer);};
  },[billingPeriodId,charge?.expiresAt,charge?.state,expireMonthlyCharge]);

  const copyPayload = async () => {
    if (!charge?.qrCodePayload) return;
    try {
      await navigator.clipboard.writeText(charge.qrCodePayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.");
    }
  };

  if (!charge) {
    return <div>
      <button type="button" onClick={resumeExisting?()=>void refreshCharge():()=>void createCharge()} disabled={loading||refreshing} className="flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
        {loading||refreshing ? <LoaderCircle className="size-5 animate-spin" /> : <QrCode className="size-5" />}
        {loading||refreshing ? "Carregando cobrança..." : resumeExisting ? "Continuar PIX" : "PIX"}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
    </div>;
  }

  const imageSource = charge.qrCodeImageBase64
    ? charge.qrCodeImageBase64.startsWith("data:image/") ? charge.qrCodeImageBase64 : `data:image/png;base64,${charge.qrCodeImageBase64}`
    : null;

  const isPaid=charge.state === "PAID";
  const isTerminal=charge.state === "EXPIRED" || charge.state === "CANCELLED" || charge.state === "RECONCILIATION_FAILED";
  const statusLabel=isPaid ? "Pago" : isTerminal ? (charge.state === "EXPIRED" ? "PIX expirado" : "Cobrança indisponível") : charge.state === "RECONCILING" ? "Confirmando pagamento" : "Aguardando pagamento";
  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:col-span-3 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold">Pagamento via PIX</h3><p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(charge.amount)}</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${isPaid ? "bg-emerald-100 text-emerald-700" : isTerminal ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>{statusLabel}</span>
    </div>
    {!isPaid && !isTerminal ? <div className="grid gap-4 md:grid-cols-[200px_1fr]"><div className="grid min-h-48 place-items-center rounded-xl border bg-white p-3">{imageSource ? <Image unoptimized src={imageSource} alt="QR Code para pagamento PIX" width={184} height={184} className="size-44" /> : <p className="text-center text-xs text-slate-500">QR Code indisponível para esta cobrança.</p>}</div><div className="min-w-0 space-y-3"><div><label htmlFor={`pix-code-${sessionId??billingPeriodId}`} className="text-xs font-semibold text-slate-600">Código PIX Copia e Cola</label><textarea id={`pix-code-${sessionId??billingPeriodId}`} readOnly value={charge.qrCodePayload ?? ""} rows={5} className="mt-1 w-full resize-none rounded-xl border bg-white p-3 text-xs outline-none" /></div><button type="button" onClick={copyPayload} disabled={!charge.qrCodePayload} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Código copiado" : "Copiar código PIX"}</button>{billingPeriodId&&remainingSeconds!==null?<p className={`text-sm font-bold ${remainingSeconds<=60?"text-amber-700":"text-slate-700"}`}>Expira em {formatCountdown(remainingSeconds)}</p>:charge.expiresAt?<p className="text-xs text-slate-600">Expira em {formatExpiration(charge.expiresAt)}</p>:null}</div></div> : null}
    {isTerminal&&billingPeriodId&&!isPaid?<button type="button" onClick={()=>void createCharge()} disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">{loading?<LoaderCircle className="size-4 animate-spin"/>:<QrCode className="size-4"/>}{loading?"Gerando novo PIX...":"Gerar novo PIX"}</button>:<button type="button" onClick={() => void refreshCharge()} disabled={refreshing} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border bg-white text-sm font-bold text-blue-600 disabled:opacity-50"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Verificando..." : "Atualizar estado"}</button>}
    {error ? <p role="alert" className="text-xs font-semibold text-red-600">{error}</p> : null}
  </section>;
}

function parseCharge(value: unknown): PixCharge | null {if (!value || typeof value !== "object") return null;const item = value as Record<string, unknown>;const allowedStates = ["CREATING", "RECONCILING", "PENDING", "PAID", "EXPIRED", "CANCELLED", "RECONCILIATION_FAILED"];if (!allowedStates.includes(String(item.state)) || typeof item.amount !== "number") return null;return {state: item.state as PixCharge["state"],amount: item.amount,qrCodePayload: typeof item.qrCodePayload === "string" ? item.qrCodePayload : null,qrCodeImageBase64: typeof item.qrCodeImageBase64 === "string" ? item.qrCodeImageBase64 : null,expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null};}
function formatMoney(value: number) {return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);}
function formatExpiration(value: string) {const date = new Date(value);return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);}
function formatCountdown(seconds:number){const minutes=Math.floor(seconds/60);const rest=seconds%60;return `${String(minutes).padStart(2,"0")}:${String(rest).padStart(2,"0")}`;}
