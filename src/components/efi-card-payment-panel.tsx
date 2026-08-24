"use client";

import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { FormEvent, useRef, useState } from "react";

type EfiCardResponse = {
  payment?: { state?: unknown };
  error?: unknown;
  uncertain?: unknown;
};

type FieldName = "holderName" | "holderDocument" | "email" | "phone" | "number" | "expirationMonth" | "expirationYear" | "cvv";
type FieldErrors = Partial<Record<FieldName, string>>;
type CheckoutStage = "FORM" | "TOKENIZATION" | "BACKEND" | "CONFIRMATION" | "SUCCESS";

const accountIdentifier = process.env.NEXT_PUBLIC_EFI_ACCOUNT_IDENTIFIER;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizedExpiryYear(value: string) {
  const raw = digits(value);
  return raw.length === 2 ? `20${raw}` : raw;
}

function friendlyError(code: string) {
  if (code.includes("BRAND")) return "Não conseguimos identificar a bandeira deste cartão.";
  if (code.includes("EXPIRY")) return "Confira a validade do cartão.";
  if (code.includes("TOKEN")) return "Não foi possível validar os dados do cartão. Confira as informações e tente novamente.";
  if (code.includes("FINGERPRINT")) return "Não foi possível validar o ambiente seguro do pagamento. Atualize a página e tente novamente.";
  return "Não foi possível concluir o pagamento agora. Verifique os dados e tente novamente mais tarde.";
}

function inputClass(hasError: boolean) {
  return `min-h-11 rounded-xl border bg-white px-3 outline-none transition focus:ring-2 ${hasError ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"}`;
}

export function EfiCardPaymentPanel({
  sessionId,
  amountLabel,
  onSuccess,
}: {
  sessionId: string;
  amountLabel?: string;
  onSuccess?: () => void;
}) {
  const [holderName, setHolderName] = useState("");
  const [holderDocument, setHolderDocument] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [number, setNumber] = useState("");
  const [cvv, setCvv] = useState("");
  const [expirationMonth, setExpirationMonth] = useState("");
  const [expirationYear, setExpirationYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<CheckoutStage>("FORM");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const refs = {
    holderName: useRef<HTMLInputElement>(null),
    holderDocument: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    number: useRef<HTMLInputElement>(null),
    expirationMonth: useRef<HTMLInputElement>(null),
    expirationYear: useRef<HTMLInputElement>(null),
    cvv: useRef<HTMLInputElement>(null),
  };

  const focusField = (name: FieldName) => {
    requestAnimationFrame(() => {
      refs[name].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      refs[name].current?.focus();
    });
  };

  const validate = () => {
    const next: FieldErrors = {};
    const cpf = digits(holderDocument);
    const tel = digits(phone);
    const cardNumber = digits(number);
    const month = digits(expirationMonth);
    const year = normalizedExpiryYear(expirationYear);
    const securityCode = digits(cvv);

    if (holderName.trim().length < 3) next.holderName = "Informe o nome do titular.";
    if (cpf.length !== 11) next.holderDocument = "Confira o CPF informado.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Informe um e-mail válido.";
    if (tel.length < 10 || tel.length > 11) next.phone = "Confira o telefone.";
    if (cardNumber.length < 13 || cardNumber.length > 19) next.number = "Confira o número do cartão.";
    if (!/^(0[1-9]|1[0-2])$/.test(month)) next.expirationMonth = "Confira o mês.";
    if (!/^20\d{2}$/.test(year)) next.expirationYear = "Confira o ano.";
    if (securityCode.length < 3 || securityCode.length > 4) next.cvv = "Confira o CVV.";

    setFieldErrors(next);
    const first = Object.keys(next)[0] as FieldName | undefined;
    if (first) {
      setGeneralError("Encontramos uma informação que precisa ser corrigida.");
      focusField(first);
      return null;
    }
    setGeneralError(null);
    return { cpf, tel, cardNumber, month, year, securityCode };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountIdentifier) {
      setGeneralError("Pagamento por cartão indisponível no momento.");
      return;
    }

    const values = validate();
    if (!values) return;

    setSubmitting(true);
    setGeneralError(null);
    try {
      setStage("TOKENIZATION");
      const { default: EfiPay } = await import("payment-token-efi");
      const scriptBlocked = await EfiPay.CreditCard.isScriptBlocked();
      if (scriptBlocked) throw new Error("EFI_CARD_FINGERPRINT_BLOCKED");

      const brand = await EfiPay.CreditCard.setCardNumber(values.cardNumber).verifyCardBrand();
      if (!brand || brand === "undefined" || brand === "unsupported") throw new Error("EFI_CARD_BRAND_UNSUPPORTED");

      const tokenResult = await EfiPay.CreditCard
        .setAccount(accountIdentifier)
        .setEnvironment("sandbox")
        .setCreditCardData({
          brand,
          number: values.cardNumber,
          cvv: values.securityCode,
          expirationMonth: values.month,
          expirationYear: values.year,
          holderName: holderName.trim(),
          holderDocument: values.cpf,
          reuse: false,
        })
        .getPaymentToken();

      if (!("payment_token" in tokenResult) || typeof tokenResult.payment_token !== "string" || !tokenResult.payment_token) {
        throw new Error("EFI_CARD_TOKENIZATION_FAILED");
      }

      setNumber("");
      setCvv("");
      setStage("BACKEND");
      const response = await fetch("/api/payments/efi-card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          paymentToken: tokenResult.payment_token,
          payer: { name: holderName.trim(), cpf: values.cpf, email: email.trim(), phone: values.tel },
          cardMeta: { brand: String(brand), last4: values.cardNumber.slice(-4) },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as EfiCardResponse;
      setStage("CONFIRMATION");

      if (!response.ok) {
        if (body.uncertain === true) {
          setGeneralError("Estamos confirmando o resultado deste pagamento. Não tente pagar novamente agora.");
          return;
        }
        const code = typeof body.error === "string" ? body.error : "EFI_CARD_REQUEST_FAILED";
        throw new Error(code);
      }

      const state = typeof body.payment === "object" && body.payment ? (body.payment as { state?: unknown }).state : null;
      if (state === "PAID") {
        setStage("SUCCESS");
        return;
      }
      if (state === "REVIEW" || state === "PENDING") {
        setGeneralError("Pagamento enviado. Estamos aguardando a confirmação da instituição. Não tente pagar novamente agora.");
        return;
      }
      throw new Error("EFI_CARD_REQUEST_FAILED");
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "EFI_CARD_REQUEST_FAILED";
      const message = friendlyError(code);
      setStage("FORM");
      setGeneralError(message);
      if (code.includes("BRAND") || code.includes("TOKEN")) {
        setFieldErrors((current) => ({ ...current, number: "Confira os dados do cartão." }));
        focusField("number");
      }
    } finally {
      setNumber("");
      setCvv("");
      setSubmitting(false);
    }
  };

  if (!accountIdentifier) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Pagamento por cartão indisponível no momento.</p>;
  }

  if (stage === "SUCCESS") {
    return (
      <div className="py-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-9" /></span>
        <h3 className="mt-4 text-2xl font-bold text-slate-950">Pagamento aprovado</h3>
        {amountLabel ? <p className="mt-2 text-3xl font-black text-emerald-700">{amountLabel}</p> : null}
        <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">Seu pagamento foi confirmado. A saída será liberada normalmente pelo atendimento do estacionamento.</p>
        <button type="button" onClick={onSuccess} className="mt-6 min-h-11 rounded-xl bg-blue-700 px-6 font-bold text-white">Concluir</button>
      </div>
    );
  }

  if (stage !== "FORM") {
    const progress = stage === "TOKENIZATION" ? 33 : stage === "BACKEND" ? 66 : 90;
    const label = stage === "TOKENIZATION" ? "Validando dados do cartão…" : stage === "BACKEND" ? "Enviando pagamento com segurança…" : "Confirmando pagamento…";
    return (
      <div className="py-10 text-center" aria-live="polite">
        <LoaderCircle className="mx-auto size-12 animate-spin text-blue-700" />
        <h3 className="mt-4 text-xl font-bold text-slate-950">Processando pagamento</h3>
        <p className="mt-2 text-sm text-slate-600">{label}</p>
        <div className="mx-auto mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-700 transition-all duration-300" style={{ width: `${progress}%` }} /></div>
        <p className="mt-3 text-xs text-slate-500">Não feche esta janela enquanto confirmamos o pagamento.</p>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-5 text-blue-700" /><div><h3 className="font-bold text-blue-950">Cartão de crédito</h3><p className="text-xs text-slate-500">Pagamento protegido pela Efí. Os dados completos do cartão não são armazenados pela Star Carvalhos.</p></div></div>
      {generalError ? <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{generalError}</div> : null}
      <form onSubmit={submit} className="grid gap-3 text-sm" noValidate>
        <label className="grid gap-1"><span className="font-semibold text-slate-700">Nome do titular</span><input ref={refs.holderName} value={holderName} onChange={(event) => { setHolderName(event.target.value); setFieldErrors((current) => ({ ...current, holderName: undefined })); }} autoComplete="cc-name" className={inputClass(!!fieldErrors.holderName)} />{fieldErrors.holderName ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.holderName}</span> : null}</label>
        <label className="grid gap-1"><span className="font-semibold text-slate-700">CPF</span><input ref={refs.holderDocument} value={holderDocument} onChange={(event) => { setHolderDocument(event.target.value); setFieldErrors((current) => ({ ...current, holderDocument: undefined })); }} inputMode="numeric" autoComplete="off" className={inputClass(!!fieldErrors.holderDocument)} />{fieldErrors.holderDocument ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.holderDocument}</span> : null}</label>
        <label className="grid gap-1"><span className="font-semibold text-slate-700">E-mail</span><input ref={refs.email} type="email" value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: undefined })); }} autoComplete="email" className={inputClass(!!fieldErrors.email)} />{fieldErrors.email ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.email}</span> : null}</label>
        <label className="grid gap-1"><span className="font-semibold text-slate-700">Telefone</span><input ref={refs.phone} value={phone} onChange={(event) => { setPhone(event.target.value); setFieldErrors((current) => ({ ...current, phone: undefined })); }} inputMode="tel" autoComplete="tel" className={inputClass(!!fieldErrors.phone)} />{fieldErrors.phone ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.phone}</span> : null}</label>
        <label className="grid gap-1"><span className="font-semibold text-slate-700">Número do cartão</span><input ref={refs.number} value={number} onChange={(event) => { setNumber(event.target.value); setFieldErrors((current) => ({ ...current, number: undefined })); }} inputMode="numeric" autoComplete="cc-number" className={inputClass(!!fieldErrors.number)} />{fieldErrors.number ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.number}</span> : null}</label>
        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-1"><span className="font-semibold text-slate-700">Mês</span><input ref={refs.expirationMonth} value={expirationMonth} onChange={(event) => { setExpirationMonth(event.target.value); setFieldErrors((current) => ({ ...current, expirationMonth: undefined })); }} placeholder="MM" inputMode="numeric" autoComplete="cc-exp-month" className={inputClass(!!fieldErrors.expirationMonth)} />{fieldErrors.expirationMonth ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.expirationMonth}</span> : null}</label>
          <label className="grid gap-1"><span className="font-semibold text-slate-700">Ano</span><input ref={refs.expirationYear} value={expirationYear} onChange={(event) => { setExpirationYear(event.target.value); setFieldErrors((current) => ({ ...current, expirationYear: undefined })); }} placeholder="AAAA" inputMode="numeric" autoComplete="cc-exp-year" className={inputClass(!!fieldErrors.expirationYear)} />{fieldErrors.expirationYear ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.expirationYear}</span> : null}</label>
          <label className="grid gap-1"><span className="font-semibold text-slate-700">CVV</span><input ref={refs.cvv} value={cvv} onChange={(event) => { setCvv(event.target.value); setFieldErrors((current) => ({ ...current, cvv: undefined })); }} inputMode="numeric" autoComplete="cc-csc" className={inputClass(!!fieldErrors.cvv)} />{fieldErrors.cvv ? <span className="text-xs font-semibold text-rose-600">{fieldErrors.cvv}</span> : null}</label>
        </div>
        <button type="submit" disabled={submitting} className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-bold text-white disabled:opacity-50">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}{amountLabel ? `Pagar ${amountLabel}` : "Pagar com cartão"}</button>
      </form>
    </section>
  );
}
