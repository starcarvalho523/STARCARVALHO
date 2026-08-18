"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

export function ShareRegistrationButton() {
  const [copied, setCopied] = useState(false);

  async function shareRegistration() {
    const url = `${window.location.origin}/cadastro`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Cadastro Star Carvalhos", text: "Crie sua conta de cliente no Star Carvalhos.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch {
        window.prompt("Copie o link de cadastro do cliente:", url);
      }
    }
  }

  return (
    <button type="button" onClick={shareRegistration} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
      <Share2 className="size-4" /> {copied ? "Link copiado" : "Compartilhar cadastro"}
    </button>
  );
}
