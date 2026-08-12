"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle, QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type PixCharge = {
  state: "CREATING" | "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
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

export function PixPaymentPanel({ sessionId, billingPeriodId }: { sessionId?: string; billingPeriodId?: string }) {
  const router = useRouter();
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readResponse = useCallback(async (response: Response) => {
    const body = (await response.json().catch(() => ({}))) as PixResponse;
    if (!response.ok) {
      const code = typeof body.error === "string" ? body.error : "PAYMENT_REQUEST_FAILED";
      throw new Error(errorMessages[code] ?? errorMessages.PAYMENT_REQUEST_FAILED);
    }
    const parsed = parseCharge(body.payment);
    if (!parsed) throw new Error(errorMessages.PAYMENT_REQUEST_FAILED);
    setCharge(parsed);
    setError(null);
    if (parsed.state === "PAID") router.refresh();
    return parsed;
  }, [router]);

  const createCharge = async () => {
    setLoading(true);
    setError(null);
    try {
      const monthly=Boolean(billingPeriodId);
      await readResponse(await fetch(monthly?"/api/payments/monthly/pix":"/api/payments/pix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(monthly?{billingPeriodId}:{sessionId}),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errorMessages.PAYMENT_REQUEST_FAILED);
    } finally {
      setLoading(false);
    }
  };

  const refreshCharge = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const endpoint=billingPeriodId?`/api/payments/monthly/pix?billingPeriodId=${encodeURIComponent(billingPeriodId)}`:`/api/payments/pix?sessionId=${encodeURIComponent(sessionId??"")}`;
      await readResponse(await fetch(endpoint, { cache: "no-store" }));
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : errorMessages.PAYMENT_REQUEST_FAILED);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [billingPeriodId,readResponse, sessionId]);

  useEffect(() => {
    if (charge?.state !== "CREATING" && charge?.state !== "PENDING") return;
    const timer = window.setInterval(() => void refreshCharge(true), 5000);
    return () => window.clearInterval(timer);
  }, [charge?.state, refreshCharge]);

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
      <button type="button" onClick={createCharge} disabled={loading} className="flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
        {loading ? <LoaderCircle className="size-5 animate-spin" /> : <QrCode className="size-5" />}
        {loading ? "Gerando cobrança..." : "PIX"}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
    </div>;
  }

  const imageSource = charge.qrCodeImageBase64
    ? charge.qrCodeImageBase64.startsWith("data:image/") ? charge.qrCodeImageBase64 : `data:image/png;base64,${charge.qrCodeImageBase64}`
    : null;

  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:col-span-3 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">Pagamento via PIX</h3>
        <p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(charge.amount)}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${charge.state === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
        {charge.state === "PAID" ? "Pago" : "Aguardando pagamento"}
      </span>
    </div>

    {charge.state !== "PAID" ? <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <div className="grid min-h-48 place-items-center rounded-xl border bg-white p-3">
        {imageSource ? <Image unoptimized src={imageSource} alt="QR Code para pagamento PIX" width={184} height={184} className="size-44" /> : <p className="text-center text-xs text-slate-500">QR Code indisponível para esta cobrança.</p>}
      </div>
      <div className="min-w-0 space-y-3">
        <div>
          <label htmlFor={`pix-code-${sessionId??billingPeriodId}`} className="text-xs font-semibold text-slate-600">Código PIX Copia e Cola</label>
          <textarea id={`pix-code-${sessionId??billingPeriodId}`} readOnly value={charge.qrCodePayload ?? ""} rows={5} className="mt-1 w-full resize-none rounded-xl border bg-white p-3 text-xs outline-none" />
        </div>
        <button type="button" onClick={copyPayload} disabled={!charge.qrCodePayload} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Código copiado" : "Copiar código PIX"}
        </button>
        {charge.expiresAt ? <p className="text-xs text-slate-600">Expira em {formatExpiration(charge.expiresAt)}</p> : null}
      </div>
    </div> : null}

    <button type="button" onClick={() => void refreshCharge()} disabled={refreshing} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border bg-white text-sm font-bold text-blue-600 disabled:opacity-50">
      <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Verificando..." : "Atualizar estado"}
    </button>
    {error ? <p role="alert" className="text-xs font-semibold text-red-600">{error}</p> : null}
  </section>;
}

function parseCharge(value: unknown): PixCharge | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const allowedStates = ["CREATING", "PENDING", "PAID", "EXPIRED", "CANCELLED"];
  if (!allowedStates.includes(String(item.state)) || typeof item.amount !== "number") return null;
  return {
    state: item.state as PixCharge["state"],
    amount: item.amount,
    qrCodePayload: typeof item.qrCodePayload === "string" ? item.qrCodePayload : null,
    qrCodeImageBase64: typeof item.qrCodeImageBase64 === "string" ? item.qrCodeImageBase64 : null,
    expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatExpiration(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
