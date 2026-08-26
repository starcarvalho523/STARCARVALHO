"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard } from "lucide-react";
import { CustomerPaymentModal } from "@/components/customer-payment-modal";
import type { EfiCardBrowserEnvironment } from "@/lib/payments/payment-availability";

type PaymentOptions = { pix: boolean; credit: boolean; efiCard: boolean; efiCardEnvironment: EfiCardBrowserEnvironment | null };

export function CustomerPaymentTrigger({
  sessionId,
  plate,
  unitName,
  amountLabel,
  options,
  paid = false,
  compact = false,
}: {
  sessionId: string;
  plate: string;
  unitName: string;
  amountLabel: string;
  options: PaymentOptions;
  paid?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const available = options.pix || options.credit || options.efiCard;

  if (paid) {
    return (
      <div className={`${compact ? "" : "mt-4"} rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800`}>
        <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="size-4" />Pagamento confirmado · {amountLabel}</div>
        <p className="mt-0.5 text-xs text-emerald-700">Aguardando liberação da saída.</p>
      </div>
    );
  }

  if (!available) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${compact ? "min-h-10 px-3 text-sm" : "min-h-11 px-4 text-sm"} inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-200`}>
        <CreditCard className="size-4" />Pagar agora · {amountLabel}
      </button>
      <CustomerPaymentModal open={open} onClose={() => setOpen(false)} sessionId={sessionId} plate={plate} unitName={unitName} amountLabel={amountLabel} options={options} />
    </>
  );
}
