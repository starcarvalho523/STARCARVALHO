"use client";

import { GlobalForm } from "@/components/global-form";


import { useEffect, useRef, useState } from "react";
import { CircleDollarSign, Plus, X } from "lucide-react";
import { createPlan } from "../actions";
import { field, primary, secondary } from "../ui";

type UnitOption = { id: string; name: string };
const WEEKDAYS = [[0,"Dom"],[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"]] as const;

export function NewPlanModal({ units, defaultOpen = false }: { units: UnitOption[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [access24h, setAccess24h] = useState(true);
  const [guaranteed, setGuaranteed] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(focusTimer); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return <>
    <button type="button" className={primary} onClick={() => setOpen(true)}><Plus className="mr-2 size-4" />Novo plano</button>
    {open ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-plan-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CircleDollarSign className="size-5" /></span><div><h2 id="new-plan-title" className="text-lg font-bold text-slate-950 sm:text-xl">Criar plano comercial 2.0</h2><p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500 sm:text-sm">Preço, cobertura, simultaneidade, garantia de vaga, dias e horários de acesso. Cada pagamento cobre 30 dias corridos.</p></div></div>
          <button type="button" aria-label="Fechar modal" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"><X className="size-5" /></button>
        </div>
        <GlobalForm action={createPlan} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain p-4 md:grid-cols-2 lg:grid-cols-3 sm:p-5">
            <Label text="Unidade"><select name="unitId" required className={field}>{units.map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Label>
            <Label text="Nome do plano"><input ref={nameInputRef} name="name" minLength={2} required className={field} placeholder="Ex.: Mensal Garantido" /></Label>
            <Label text="Categoria"><select name="planCategory" defaultValue="STANDARD" className={field}><option value="ECONOMIC">Econômico</option><option value="STANDARD">Padrão</option><option value="GUARANTEED">Garantido</option><option value="BUSINESS">Empresarial</option></select></Label>
            <Label text="Preço por 30 dias"><div className="flex rounded-xl border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><span className="grid shrink-0 place-items-center border-r border-slate-200 px-3 text-sm font-semibold text-slate-500">R$</span><input name="price" type="number" min="0.01" step="0.01" required inputMode="decimal" className="min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2.5 text-sm outline-none" placeholder="0,00" /></div></Label>
            <Label text="Veículos aceitos"><select name="vehicleScope" defaultValue="BOTH" className={field}><option value="BOTH">Carro e moto</option><option value="CAR">Somente carro</option><option value="MOTORCYCLE">Somente moto</option></select></Label>
            <Label text="Dias de tolerância"><input name="graceDays" type="number" min="0" max="90" defaultValue="0" required className={field} /></Label>
            <Label text="Veículos cadastráveis"><input name="maxVehicles" type="number" min="1" max="100" defaultValue="1" required className={field} /></Label>
            <Label text="Veículos simultâneos"><input name="maxSimultaneous" type="number" min="1" max="100" defaultValue="1" required className={field} /></Label>
            <Label text="Capacidade reservada"><input name="reservedCapacity" type="number" min="0" max="10000" defaultValue="0" required className={field} /></Label>
            <Label text="Limite de entradas/dia (opcional)"><input name="dailyEntryLimit" type="number" min="1" max="100" className={field} placeholder="Ilimitado" /></Label>
            <Label text="Aviso para cancelamento (dias)"><input name="cancellationNoticeDays" type="number" min="0" max="90" defaultValue="0" required className={field} /></Label>
            <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm"><label className="flex items-center justify-between gap-3 font-semibold text-slate-700"><span>Vaga garantida</span><input name="guaranteedSpace" type="checkbox" value="true" checked={guaranteed} onChange={(e)=>setGuaranteed(e.target.checked)} className="size-4" /></label><p className="text-xs leading-5 text-slate-500">Use apenas quando houver capacidade realmente reservada. Plano garantido vendido sem capacidade vira risco operacional.</p></div>
            <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm"><label className="flex items-center justify-between gap-3 font-semibold text-slate-700"><span>Acesso 24h</span><input name="access24h" type="checkbox" value="true" checked={access24h} onChange={(e)=>setAccess24h(e.target.checked)} className="size-4" /></label><p className="text-xs leading-5 text-slate-500">Desative para restringir o plano a uma janela de horário.</p></div>
            <div className="space-y-3 rounded-xl border border-slate-200 p-3"><div className="text-sm font-semibold text-slate-700">Janela de acesso</div><div className="grid grid-cols-2 gap-2"><input name="accessStart" type="time" disabled={access24h} className={field} /><input name="accessEnd" type="time" disabled={access24h} className={field} /></div><label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input name="holidaysAllowed" type="checkbox" value="true" defaultChecked className="size-4" />Permitir feriados</label></div>
            <fieldset className="rounded-xl border border-slate-200 p-3 md:col-span-2 lg:col-span-3"><legend className="px-1 text-sm font-semibold text-slate-700">Dias permitidos</legend><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{WEEKDAYS.map(([value,label])=><label key={value} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold text-slate-700"><input name="allowedWeekday" type="checkbox" value={value} defaultChecked className="size-4" />{label}</label>)}</div><p className="mt-2 text-xs leading-5 text-slate-500">O motor de entrada respeita estes dias. Pelo menos um dia deve permanecer marcado.</p></fieldset>
            <Label text="Descrição" className="md:col-span-2 lg:col-span-3"><textarea name="description" rows={3} className={`${field} resize-none`} placeholder="Público, benefícios e condições comerciais." /></Label>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800 md:col-span-2 lg:col-span-3"><b>Regra importante:</b> veículos cadastráveis e veículos simultâneos são conceitos diferentes. Um cliente pode ter várias placas no plano, mas ocupar somente a quantidade simultânea contratada.</div>
            {guaranteed && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2 lg:col-span-3">Planos com vaga garantida devem ser vendidos apenas dentro da capacidade reservada da unidade/zona. O dashboard de capacidade acompanha esse limite.</div>}
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-5"><button type="button" className={secondary} onClick={() => setOpen(false)}>Cancelar</button><button className={primary}>Criar plano</button></div>
        </GlobalForm>
      </section>
    </div> : null}
  </>;
}

function Label({ text, children, className = "" }: { text:string; children:React.ReactNode; className?:string }) {
  return <label className={`space-y-1.5 text-sm font-semibold text-slate-700 ${className}`}><span>{text}</span>{children}</label>;
}
