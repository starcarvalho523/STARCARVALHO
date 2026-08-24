"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

type EfiCardResponse = {
  payment?: { state?: unknown };
  error?: unknown;
};

const accountIdentifier = process.env.NEXT_PUBLIC_EFI_ACCOUNT_IDENTIFIER;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizedExpiryYear(value: string) {
  const raw = digits(value);
  return raw.length === 2 ? `20${raw}` : raw;
}

function errorCode(value: unknown): string {
  return typeof value === "string" ? value : "EFI_CARD_REQUEST_FAILED";
}

/**
 * This is the sole client-side boundary for payment-token-efi. The SDK is
 * dynamically imported only after submit so it is never evaluated during SSR.
 * PAN and CVV remain local to this component and are cleared after tokenization.
 * Only the ephemeral token plus non-sensitive brand/last4 metadata cross the
 * browser/backend boundary.
 */
export function EfiCardPaymentPanel({ sessionId }: { sessionId: string }) {
  const [holderName, setHolderName] = useState("");
  const [holderDocument, setHolderDocument] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [number, setNumber] = useState("");
  const [cvv, setCvv] = useState("");
  const [expirationMonth, setExpirationMonth] = useState("");
  const [expirationYear, setExpirationYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountIdentifier) {
      setMessage("Pagamento por cartão indisponível no momento.");
      return;
    }

    const month = digits(expirationMonth);
    const year = normalizedExpiryYear(expirationYear);
    if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^20\d{2}$/.test(year)) {
      setMessage("Use validade no formato MM / AAAA.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const { default: EfiPay } = await import("payment-token-efi");
      const scriptBlocked = await EfiPay.CreditCard.isScriptBlocked();
      if (scriptBlocked) throw new Error("EFI_CARD_FINGERPRINT_BLOCKED");

      const cardNumber = digits(number);
      const brand = await EfiPay.CreditCard.setCardNumber(cardNumber).verifyCardBrand();
      if (!brand || brand === "undefined" || brand === "unsupported") throw new Error("EFI_CARD_BRAND_UNSUPPORTED");

      const tokenResult = await EfiPay.CreditCard
        .setAccount(accountIdentifier)
        .setEnvironment("sandbox")
        .setCreditCardData({
          brand,
          number: cardNumber,
          cvv: digits(cvv),
          expirationMonth: month,
          expirationYear: year,
          holderName: holderName.trim(),
          holderDocument: digits(holderDocument),
          reuse: false,
        })
        .getPaymentToken();

      if (!("payment_token" in tokenResult) || typeof tokenResult.payment_token !== "string" || !tokenResult.payment_token) {
        throw new Error("EFI_CARD_TOKENIZATION_FAILED");
      }

      const response = await fetch("/api/payments/efi-card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          paymentToken: tokenResult.payment_token,
          payer: { name: holderName.trim(), cpf: digits(holderDocument), email: email.trim(), phone: digits(phone) },
          cardMeta: { brand: String(brand), last4: cardNumber.slice(-4) },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as EfiCardResponse;
      if (!response.ok) throw new Error(errorCode(body.error));
      const state = typeof body.payment === "object" && body.payment ? (body.payment as { state?: unknown }).state : null;
      setMessage(state === "PAID" ? "Pagamento aprovado." : state === "REVIEW" ? "Pagamento em análise." : "Pagamento enviado para confirmação.");
    } catch {
      setMessage("Não foi possível processar o cartão. Tente novamente somente após verificar o status do pagamento.");
    } finally {
      setNumber("");
      setCvv("");
      setSubmitting(false);
    }
  };

  if (!accountIdentifier) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Pagamento por cartão indisponível no momento.</p>;
  }

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
    <div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-5 text-blue-700" /><h3 className="font-bold text-blue-950">Cartão de crédito</h3></div>
    <form onSubmit={submit} className="grid gap-2 text-sm" noValidate>
      <input required value={holderName} onChange={(event) => setHolderName(event.target.value)} placeholder="Nome impresso no cartão" autoComplete="cc-name" className="min-h-11 rounded-xl border bg-white px-3" />
      <input required value={holderDocument} onChange={(event) => setHolderDocument(event.target.value)} placeholder="CPF do titular" inputMode="numeric" autoComplete="off" className="min-h-11 rounded-xl border bg-white px-3" />
      <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail" autoComplete="email" className="min-h-11 rounded-xl border bg-white px-3" />
      <input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefone" inputMode="tel" autoComplete="tel" className="min-h-11 rounded-xl border bg-white px-3" />
      <input required value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Número do cartão" inputMode="numeric" autoComplete="cc-number" className="min-h-11 rounded-xl border bg-white px-3" />
      <div className="grid grid-cols-3 gap-2"><input required value={expirationMonth} onChange={(event) => setExpirationMonth(event.target.value)} placeholder="MM" inputMode="numeric" autoComplete="cc-exp-month" className="min-h-11 rounded-xl border bg-white px-3" /><input required value={expirationYear} onChange={(event) => setExpirationYear(event.target.value)} placeholder="AAAA" inputMode="numeric" autoComplete="cc-exp-year" className="min-h-11 rounded-xl border bg-white px-3" /><input required value={cvv} onChange={(event) => setCvv(event.target.value)} placeholder="CVV" inputMode="numeric" autoComplete="cc-csc" className="min-h-11 rounded-xl border bg-white px-3" /></div>
      <button type="submit" disabled={submitting} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}{submitting ? "Processando..." : "Pagar com cartão"}</button>
    </form>
    {message ? <p role="status" className="mt-2 text-xs font-semibold text-slate-700">{message}</p> : null}
  </section>;
}
