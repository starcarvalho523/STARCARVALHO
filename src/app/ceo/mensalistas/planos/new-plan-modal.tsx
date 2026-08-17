"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, Plus, X } from "lucide-react";
import { createPlan } from "../actions";
import { field, primary, secondary } from "../ui";

type UnitOption = { id: string; name: string };

export function NewPlanModal({
  units,
  defaultOpen = false,
}: {
  units: UnitOption[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button type="button" className={primary} onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" />
        Novo plano
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-plan-title"
            className="my-6 w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <CircleDollarSign className="size-5" />
                </span>
                <div>
                  <h2 id="new-plan-title" className="text-xl font-bold text-slate-950">
                    Criar novo plano
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Defina as condições comerciais que serão congeladas quando uma assinatura for criada.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar modal"
                onClick={() => setOpen(false)}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <form action={createPlan} className="grid gap-4 p-5 md:grid-cols-2 sm:p-6">
              <Label text="Unidade">
                <select name="unitId" required className={field}>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </Label>

              <Label text="Nome do plano">
                <input name="name" minLength={2} required className={field} placeholder="Ex.: Mensal padrão" />
              </Label>

              <Label text="Preço mensal">
                <div className="flex rounded-xl border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                  <span className="grid shrink-0 place-items-center border-r border-slate-200 px-3 text-sm font-semibold text-slate-500">
                    R$
                  </span>
                  <input
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    inputMode="decimal"
                    className="min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2.5 text-sm outline-none"
                    placeholder="0,00"
                  />
                </div>
              </Label>

              <Label text="Dia do vencimento">
                <input name="dueDay" type="number" min="1" max="31" defaultValue="10" required className={field} />
              </Label>

              <Label text="Dias de tolerância">
                <input name="graceDays" type="number" min="0" max="90" defaultValue="0" required className={field} />
              </Label>

              <Label text="Máximo de veículos">
                <input name="maxVehicles" type="number" min="1" max="100" defaultValue="1" required className={field} />
              </Label>

              <Label text="Descrição" className="md:col-span-2">
                <textarea
                  name="description"
                  rows={3}
                  className={`${field} resize-none`}
                  placeholder="Descreva o público ou as condições deste plano."
                />
              </Label>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 md:col-span-2 sm:flex-row sm:justify-end">
                <button type="button" className={secondary} onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button className={primary}>Criar plano</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Label({
  text,
  children,
  className = "",
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-1.5 text-sm font-semibold text-slate-700 ${className}`}>
      <span>{text}</span>
      {children}
    </label>
  );
}
