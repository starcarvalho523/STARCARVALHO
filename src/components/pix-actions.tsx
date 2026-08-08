"use client";

import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";

const demoPix = "00020101021226890014BR.GOV.BCB.PIX2567pix.star-cavalos.demo/ABC1D23520400005303986540512.005802BR";

export function PixActions() {
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  return <div className="mt-4 space-y-3">
    <button onClick={() => setGenerated(true)} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 active:scale-[.99]">{generated ? "PIX demonstrativo gerado" : "Gerar PIX"}</button>
    <button disabled={!generated} onClick={async () => { await navigator.clipboard.writeText(demoPix); setCopied(true); }} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-blue-600 disabled:text-slate-400"><Copy className="size-4" />{copied ? "Código copiado" : "Copiar código PIX"}</button>
    {generated ? <p role="status" className="flex items-center gap-2 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-4" />Código criado somente para demonstração; nenhum pagamento será cobrado.</p> : null}
  </div>;
}




