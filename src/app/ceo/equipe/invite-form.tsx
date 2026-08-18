"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Building2, Mail, ShieldCheck, UserPlus, UserRound, X } from "lucide-react";
import { inviteEmployee, type TeamState } from "./actions";

const initial: TeamState = {};
type TeamRole = "operator" | "manager" | "finance" | "auditor";
type UnitOption = { id: string; name: string; allowedRoles: TeamRole[] };

const roleLabel: Record<TeamRole, string> = {
  operator: "Frentista",
  manager: "Gerente",
  finance: "Financeiro",
  auditor: "Auditor",
};

const roleDescription: Record<TeamRole, string> = {
  operator: "Acesso operacional à unidade para executar as rotinas liberadas ao frentista.",
  manager: "Gestão administrativa da unidade e da equipe dentro das permissões de gerente.",
  finance: "Acesso às capacidades financeiras autorizadas para a unidade, sem gestão de equipe.",
  auditor: "Acesso de auditoria e consulta autorizado para a unidade, sem gestão operacional.",
};

export function InviteForm({ units }: { units: UnitOption[] }) {
  const [state, action, pending] = useActionState(inviteEmployee, initial);
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? units[0];
  const availableRoles = useMemo(() => selectedUnit?.allowedRoles ?? [], [selectedUnit]);
  const [role, setRole] = useState<TeamRole>(availableRoles[0] ?? "operator");

  useEffect(() => {
    if (!availableRoles.includes(role)) setRole(availableRoles[0] ?? "operator");
  }, [availableRoles, role]);

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

  if (!units.length) return null;

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          <UserPlus className="size-4" />
          Convidar membro
        </button>
        {state.success ? <p className="text-xs font-semibold text-emerald-600">{state.success}</p> : null}
        {state.error && !open ? <p className="max-w-72 text-right text-xs font-semibold text-red-600">{state.error}</p> : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => event.currentTarget === event.target && setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-team-title"
            className="my-6 w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <UserPlus className="size-5" />
                </span>
                <div>
                  <h2 id="invite-team-title" className="text-xl font-extrabold text-slate-950">Convidar membro</h2>
                  <p className="mt-1 text-sm text-slate-500">A função será vinculada somente à unidade selecionada.</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>

            <form action={action} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <Label text="Nome completo" icon={UserRound}>
                <input name="fullName" required minLength={2} placeholder="Nome do funcionário" className={field} />
              </Label>
              <Label text="E-mail profissional" icon={Mail}>
                <input name="email" type="email" required placeholder="nome@empresa.com" className={field} />
              </Label>
              <Label text="Unidade" icon={Building2}>
                <select name="unitId" required value={unitId} onChange={(event) => setUnitId(event.target.value)} className={field}>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </Label>
              <Label text="Função" icon={ShieldCheck}>
                <select name="role" required value={role} onChange={(event) => setRole(event.target.value as TeamRole)} className={field}>
                  {availableRoles.map((item) => <option key={item} value={item}>{roleLabel[item]}</option>)}
                </select>
              </Label>

              <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm"><ShieldCheck className="size-4" /></span>
                  <div>
                    <p className="font-bold text-blue-950">{roleLabel[role]}</p>
                    <p className="mt-1 text-sm leading-6 text-blue-800">{roleDescription[role]}</p>
                    <p className="mt-1 text-xs text-blue-700">O servidor valida novamente sua permissão para atribuir essa função.</p>
                  </div>
                </div>
              </div>

              {state.error ? <p role="alert" className="sm:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.error}</p> : null}

              <div className="sm:col-span-2 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button disabled={pending || !availableRoles.length} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-50">
                  {pending ? "Enviando..." : "Enviar convite"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

const field = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Label({ text, icon: Icon, children }: { text: string; icon: typeof UserRound; children: React.ReactNode }) {
  return <label className="text-sm font-semibold text-slate-700"><span className="flex items-center gap-2"><Icon className="size-4 text-slate-400" />{text}</span>{children}</label>;
}
