"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGlobalRouter as useRouter } from "@/components/global-loading-provider";
import { CreditCard, LoaderCircle, LockKeyhole, QrCode, ShieldCheck, X } from "lucide-react";
import { EfiCardPaymentPanel } from "@/components/efi-card-payment-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import type { EfiCardBrowserEnvironment } from "@/lib/payments/payment-availability";

type PaymentOptions={pix:boolean;credit:boolean;efiCard:boolean;efiCardEnvironment?:EfiCardBrowserEnvironment|null};
type Method="PIX"|"EFI_CARD"|"CREDIT";

export function CustomerPaymentModal({open,onClose,sessionId,plate,unitName,amountLabel,options}:{open:boolean;onClose:()=>void;sessionId:string;plate:string;unitName:string;amountLabel:string;options:PaymentOptions}){
  const router=useRouter();
  const closeButtonRef=useRef<HTMLButtonElement>(null);
  const [processing,setProcessing]=useState(false);
  const [switching,setSwitching]=useState(false);
  const [switchError,setSwitchError]=useState<string|null>(null);
  const [method,setMethod]=useState<Method>(()=>defaultMethod(options));
  const busy=processing||switching;

  const requestClose=()=>{if(!busy)onClose()};

  useEffect(()=>{
    if(!open)return;
    setMethod(defaultMethod(options));setSwitchError(null);
    closeButtonRef.current?.focus();
    const listener=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)onClose()};
    document.addEventListener("keydown",listener);document.body.style.overflow="hidden";
    return()=>{document.removeEventListener("keydown",listener);document.body.style.overflow=""};
  },[open,onClose,busy,options]);

  if(!open||typeof document==="undefined")return null;

  const finish=()=>{setProcessing(false);onClose();router.refresh()};

  const selectMethod=async(target:Method)=>{
    if(target===method||busy)return;
    setSwitchError(null);
    if(method==="PIX"&&target!=="PIX"){
      setSwitching(true);
      try{
        const response=await fetch("/api/payments/efi-pix",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId}),cache:"no-store"});
        const body=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Não foi possível trocar o meio de pagamento.");
      }catch(cause){setSwitchError(cause instanceof Error?cause.message:"Não foi possível trocar o meio de pagamento.");setSwitching(false);return}
      setSwitching(false);
    }
    setMethod(target);
  };

  const nativeCard=options.efiCard&&Boolean(options.efiCardEnvironment);
  const legacyCredit=options.credit&&!nativeCard;

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-3 backdrop-blur-sm" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)requestClose()}}>
      <section role="dialog" aria-modal="true" aria-labelledby="customer-payment-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div><div className="flex items-center gap-2 text-blue-700"><ShieldCheck className="size-5"/><span className="text-xs font-bold uppercase tracking-wide">Pagamento protegido</span></div><h2 id="customer-payment-title" className="mt-1 text-2xl font-black text-slate-950">Pagamento seguro</h2></div>
          <button ref={closeButtonRef} type="button" onClick={requestClose} disabled={busy} aria-label={busy?"Pagamento em processamento":"Fechar pagamento"} className="grid size-10 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><X className="size-5"/></button>
        </header>
        <div className="p-5 sm:p-6">
          <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-xs font-semibold uppercase text-blue-600">Estadia</p><p className="mt-1 text-lg font-black text-slate-950">{plate}</p><p className="text-sm text-slate-600">{unitName}</p></div><div className="sm:text-right"><p className="text-xs text-slate-500">Total</p><p className="text-2xl font-black text-emerald-700">{amountLabel}</p></div></div>
          <div className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-blue-700"/><p><strong className="text-slate-800">Seus dados do cartão ficam protegidos.</strong> A Star Carvalhos não armazena o número completo do cartão nem o CVV.</p></div>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
            {options.pix?<button type="button" disabled={busy} onClick={()=>void selectMethod("PIX")} className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${method==="PIX"?"bg-white text-emerald-700 shadow-sm":"text-slate-600 hover:bg-white/60"}`}><QrCode className="size-4"/>PIX</button>:null}
            {nativeCard?<button type="button" disabled={busy} onClick={()=>void selectMethod("EFI_CARD")} className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${method==="EFI_CARD"?"bg-white text-blue-700 shadow-sm":"text-slate-600 hover:bg-white/60"}`}><CreditCard className="size-4"/>Cartão</button>:legacyCredit?<button type="button" disabled={busy} onClick={()=>void selectMethod("CREDIT")} className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${method==="CREDIT"?"bg-white text-blue-700 shadow-sm":"text-slate-600 hover:bg-white/60"}`}><CreditCard className="size-4"/>Crédito</button>:null}
          </div>
          {switching?<div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"><LoaderCircle className="size-4 animate-spin"/>Trocando meio de pagamento com segurança...</div>:null}
          {switchError?<p role="alert" className="mt-3 text-sm font-semibold text-red-600">{switchError}</p>:null}

          <div className="mt-5">
            {method==="PIX"&&options.pix?<PixPaymentPanel sessionId={sessionId} onPaid={finish}/>:null}
            {method==="EFI_CARD"&&nativeCard&&options.efiCardEnvironment?<EfiCardPaymentPanel sessionId={sessionId} amountLabel={amountLabel} environment={options.efiCardEnvironment} onSuccess={finish} onProcessingChange={setProcessing}/>:null}
            {method==="CREDIT"&&legacyCredit?<CreditCheckoutPanel sessionId={sessionId}/>:null}
          </div>
        </div>
      </section>
    </div>,document.body,
  );
}

function defaultMethod(options:PaymentOptions):Method{
  if(options.pix)return"PIX";
  if(options.efiCard&&options.efiCardEnvironment)return"EFI_CARD";
  return"CREDIT";
}
