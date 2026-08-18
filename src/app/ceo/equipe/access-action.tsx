"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, X } from "lucide-react";
import { setEmployeeAccess } from "./actions";

export function AccessAction({
  userId,
  unitId,
  role,
  userName,
  unitName,
  roleLabel,
  active,
}: {
  userId: string;
  unitId: string;
  role: string;
  userName: string;
  unitName: string;
  roleLabel: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-blue-600 hover:text-blue-700">
        Gerenciar acesso
      </button>
      {open ? (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.currentTarget === event.target && setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="access-title" className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex gap-3">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${active ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                  {active ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
                </span>
                <div>
                  <h2 id="access-title" className="text-lg font-extrabold text-slate-950">{active ? "Bloquear acesso à unidade?" : "Reativar acesso à unidade?"}</h2>
                  <p className="mt-1 text-sm text-slate-500">A conta da pessoa e o histórico não serão excluídos.</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <Info label="Pessoa" value={userName} />
              <Info label="Unidade" value={unitName} />
              <Info label="Função" value={roleLabel} />
              <div className={`rounded-2xl p-4 leading-6 ${active ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
                {active
                  ? "Somente este vínculo será bloqueado. Outros acessos que a pessoa possua em outras unidades continuarão funcionando."
                  : "Este vínculo voltará a participar da autorização do sistema para esta unidade."}
              </div>
            </div>
            <form action={setEmployeeAccess} className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="unitId" value={unitId} />
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="enabled" value={String(!active)} />
              <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button className={`h-11 rounded-xl px-5 text-sm font-bold text-white shadow-sm ${active ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                {active ? "Bloquear nesta unidade" : "Reativar acesso"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><span className="text-slate-500">{label}</span><strong className="text-right text-slate-950">{value}</strong></div>;
}
