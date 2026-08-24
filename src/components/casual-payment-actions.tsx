"use client";

import { CustomerPaymentTrigger } from "@/components/customer-payment-trigger";

export function CasualPaymentActions({
  sessionId,
  plate,
  unitName,
  amountLabel,
  pix,
  credit,
  efiCard,
  paid = false,
}: {
  sessionId: string;
  plate: string;
  unitName: string;
  amountLabel: string;
  pix: boolean;
  credit: boolean;
  efiCard: boolean;
  paid?: boolean;
}) {
  if (!pix && !credit && !efiCard && !paid) {
    return <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Pagamento online indisponível nesta unidade.</p>;
  }

  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <CustomerPaymentTrigger
        sessionId={sessionId}
        plate={plate}
        unitName={unitName}
        amountLabel={amountLabel}
        options={{ pix, credit, efiCard }}
        paid={paid}
      />
    </section>
  );
}
