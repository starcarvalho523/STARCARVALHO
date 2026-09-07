import { GlobalForm } from "@/components/global-form";
import Link from "@/components/global-link";
import { Building2, CircleDollarSign, Map, ParkingSquare, Save, ShieldCheck } from "lucide-react";

export type UnitFormValues = {
  id?: string;
  name?: string | null;
  capacity?: number | null;
  timezone?: string | null;
  area_sqm?: number | string | null;
  monthly_fixed_cost?: number | string | null;
  is_active?: boolean | null;
};

export function UnitForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: UnitFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <GlobalForm action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="unitId" value={values.id} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="size-4.5" /></span>
          <div><h2 className="font-bold text-slate-950">Dados da unidade</h2><p className="mt-0.5 text-xs text-slate-500">Informações usadas na operação, capacidade e análises do CEO.</p></div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nome da unidade" icon={Building2} wide>
            <input name="name" required minLength={2} maxLength={100} defaultValue={values?.name ?? ""} placeholder="Ex.: Star Carvalhos Central" className={inputClass} />
          </Field>
          <Field label="Capacidade de veículos" icon={ParkingSquare}>
            <input name="capacity" required type="number" min={1} max={10000} step={1} defaultValue={values?.capacity ?? 1} className={inputClass} />
          </Field>
          <Field label="Área aproximada (m²)" icon={Map} hint="Opcional">
            <input name="areaSqm" type="number" min="0.01" step="0.01" defaultValue={values?.area_sqm ?? ""} placeholder="Ex.: 1900" className={inputClass} />
          </Field>
          <Field label="Custo fixo mensal" icon={CircleDollarSign} hint="Opcional">
            <input name="monthlyFixedCost" type="number" min="0" step="0.01" defaultValue={values?.monthly_fixed_cost ?? ""} placeholder="Ex.: 40000" className={inputClass} />
          </Field>
          <Field label="Fuso horário" icon={ShieldCheck}>
            <select name="timezone" defaultValue={values?.timezone ?? "America/Bahia"} className={inputClass}>
              <option value="America/Bahia">Bahia</option>
              <option value="America/Sao_Paulo">Brasília / São Paulo</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <input name="isActive" type="checkbox" defaultChecked={values?.is_active ?? true} className="mt-0.5 size-4 rounded border-slate-300 text-blue-600" />
          <span><span className="block text-sm font-bold text-slate-900">Unidade operacional</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Quando ativa, a unidade fica disponível para operação e gestão conforme os acessos vinculados.</span></span>
        </label>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Cancelar</Link>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"><Save className="size-4" />{submitLabel}</button>
      </div>
    </GlobalForm>
  );
}

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function Field({ label, icon: Icon, hint, wide = false, children }: { label: string; icon: typeof Building2; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Icon className="size-4 text-slate-400" />{label}{hint ? <span className="text-xs font-normal text-slate-400">· {hint}</span> : null}</span>{children}</label>;
}
