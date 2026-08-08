"use client";

import { useState } from "react";
import { CarFront, CheckCircle2, LogIn } from "lucide-react";

export function EntryForm() {
  const [plate, setPlate] = useState("");
  const [message, setMessage] = useState("");
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

  return <div id="entrada" className="scroll-mt-24">
    <form className="grid gap-3 md:grid-cols-[1fr_300px]" onSubmit={(event) => {
      event.preventDefault();
      if (normalized.length !== 7) {
        setMessage("Digite uma placa válida com 7 caracteres.");
        return;
      }
      setMessage(`Entrada de ${normalized} registrada no modo demonstração.`);
      setPlate("");
    }}>
      <label className="flex h-16 items-center rounded-xl border-2 border-blue-500 bg-white px-5 focus-within:ring-4 focus-within:ring-blue-100">
        <CarFront className="size-5 text-slate-400" />
        <span className="sr-only">Placa do veículo</span>
        <input value={normalized} onChange={(event) => setPlate(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg uppercase outline-none" placeholder="Digite a placa" autoComplete="off" inputMode="text" />
        <span className="hidden font-mono text-slate-400 sm:inline">ABC1D23</span>
      </label>
      <button type="submit" className="flex h-16 items-center justify-center gap-3 rounded-xl bg-blue-600 font-bold text-white shadow-lg transition hover:bg-blue-700 active:scale-[.99]"><LogIn className="size-5" />Registrar entrada</button>
    </form>
    {message ? <p role="status" className={`mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${message.startsWith("Digite") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}><CheckCircle2 className="size-5" />{message}</p> : null}
  </div>;
}



