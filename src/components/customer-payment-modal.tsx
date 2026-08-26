"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck, X } from "lucide-react";
import { EfiCardPaymentPanel } from "@/components/efi-card-payment-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import type { EfiCardBrowserEnvironment } from "@/lib/payments/payment-availability";

type PaymentOptions = { pix: boolean; credit: boolean; efiCard: boolean; efiCardEnvironment?: EfiCardBrowserEnvironment | null };

export function CustomerPaymentModal({
  open,
  onClose,
  sessionId,
  plate,
  unitName,
  amountLabel,
  options,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  plate: string;
  unitName: string;
  amountLabel: string;
  options: PaymentOptions;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [processing, setProcessing] = useState(false);

  const requestClose = () => {
    if (!processing) onClose();
  };

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processing) onClose();
    };
    document.addEventListener("keydown", listener);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = "";
    };
  }, [open, onClose, processing]);

  if (!open) return null;

  const finish = () => {
    setProcessing(false);
    onClose();
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="customer-payment-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-blue-700"><ShieldCheck className="size-5" /><span className="text-xs font-bold uppercase tracking-wide">Pagamento protegido</span></div>
            <h2 id="customer-payment-title" className="mt-1 text-2xl font-black text-slate-950">Pagamento seguro</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={requestClose} disabled={processing} aria-label={processing ? "Pagamento em processamento" : "Fechar pagamento"} className="grid size-10 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><X className="size-5" /></button>
        </header>

        <div className="p-5 sm:p-6">
          <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase text-blue-600">Estadia</p>
              <p className="mt-1 text-lg font-black text-slate-950">{plate}</p>
              <p className="text-sm text-slate-600">{unitName}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-2xl font-black text-emerald-700">{amountLabel}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-blue-700" />
            <p><strong className="text-slate-800">Seus dados do cartão ficam protegidos.</strong> A Star Carvalhos não armazena o número completo do cartão nem o CVV.</p>
          </div>

          <div className="mt-5 grid gap-4">
            {options.efiCard && options.efiCardEnvironment ? <EfiCardPaymentPanel sessionId={sessionId} amountLabel={amountLabel} environment={options.efiCardEnvironment} onSuccess={finish} onProcessingChange={setProcessing} /> : null}
            {options.pix ? <PixPaymentPanel sessionId={sessionId} /> : null}
            {options.credit ? <CreditCheckoutPanel sessionId={sessionId} /> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
