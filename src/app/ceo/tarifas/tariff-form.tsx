"use client";

import {
  Building2,
  CalendarClock,
  CarFront,
  Clock3,
  Coins,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  createTariffVersion,
  previewTariff,
  type TariffActionState,
} from "./actions";

const initial: TariffActionState = {};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const duration = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60
      ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`
      : `${minutes / 60}h`;

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function TariffForm({ units }: { units: Array<{ id: string; name: string }> }) {
  const [preview, previewAction, previewPending] = useActionState(previewTariff, initial);
  const [creation, createAction, createPending] = useActionState(createTariffVersion, initial);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-950">Criar nova versão</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use valores numéricos. Nenhuma versão anterior será apagada.
          </p>
        </div>
        <button
          type="reset"
          form="tariff-version-form"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-blue-600 transition hover:bg-slate-50"
        >
          <RotateCcw className="size-4" />
          Restaurar campos
        </button>
      </div>

      <form id="tariff-version-form" action={createAction} className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-3">
          <FormGroup
            title="Identificação"
            icon={Building2}
            description="Defina onde e para qual veículo a nova versão será aplicada."
          >
            <Field label="Unidade">
              <select name="unitId" required className={inputClass}>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de veículo">
              <select name="vehicleType" required className={inputClass}>
                <option value="CAR">Carro</option>
                <option value="MOTORCYCLE">Moto</option>
              </select>
            </Field>
          </FormGroup>

          <FormGroup
            title="Cobrança"
            icon={Coins}
            description="Valores oficiais utilizados pelo motor de cálculo."
          >
            <Input label="Primeira hora (R$)" name="firstHour" defaultValue="5.00" step="0.01" />
            <Input label="Fração adicional (R$)" name="additional" defaultValue="3.00" step="0.01" />
            <Input label="Duração da fração (min)" name="fractionMinutes" defaultValue="30" step="1" min="1" />
            <Input label="Diária (R$)" name="dailyAmount" defaultValue="50.00" step="0.01" />
          </FormGroup>

          <FormGroup
            title="Regras de tempo"
            icon={Clock3}
            description="Controle tolerância e quando a diária passa a valer."
          >
            <Input label="Tolerância (min)" name="toleranceMinutes" defaultValue="10" step="1" min="0" />
            <Input label="Aplicar diária após (horas)" name="dailyHours" defaultValue="10" step="1" min="1" />
            <div className="rounded-xl bg-blue-50/70 p-3 text-xs leading-5 text-blue-700">
              A tolerância não é cobrada. A diária passa a valer somente após o limite configurado.
            </div>
          </FormGroup>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/45 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-blue-950">Pré-visualização oficial</h3>
              <p className="mt-1 text-xs text-slate-500">
                Os exemplos são calculados no servidor pelo mesmo motor da operação.
              </p>
            </div>
            <button
              formAction={previewAction}
              disabled={previewPending || createPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-600 disabled:opacity-50"
            >
              <Play className="size-4" />
              {previewPending ? "Calculando..." : "Simular tarifa"}
            </button>
          </div>

          {preview.preview && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {preview.preview.slice(0, 5).map((item) => (
                <div key={item.minutes} className="rounded-xl border border-blue-100 bg-white p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
                    <Clock3 className="size-3.5" />
                    {duration(item.minutes)}
                  </div>
                  <p className="mt-2 text-lg font-extrabold text-blue-950">
                    {money.format(Number(item.total))}
                  </p>
                </div>
              ))}
            </div>
          )}

          {preview.error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
              {preview.error}
            </p>
          )}
        </div>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Save className="size-4" />
            Salvar nova versão
          </button>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <p className="font-semibold text-amber-900">
                Esta alteração valerá para novas entradas. Sessões já iniciadas continuarão utilizando a tarifa anterior.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white font-bold"
              >
                Cancelar
              </button>
              <button
                disabled={createPending}
                className="h-11 flex-1 rounded-xl bg-blue-600 font-bold text-white disabled:opacity-50"
              >
                {createPending ? "Salvando..." : "Confirmar nova tarifa"}
              </button>
            </div>
          </div>
        )}

        {(creation.error || creation.success) && (
          <p
            role="status"
            className={`rounded-xl p-3 text-sm font-semibold ${
              creation.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {creation.error ?? creation.success}
          </p>
        )}
      </form>
    </section>
  );
}

function FormGroup({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon: typeof Building2;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/45 p-4">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-blue-600 shadow-sm">
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="font-extrabold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      {children}
    </label>
  );
}

function Input({
  label,
  name,
  defaultValue,
  step,
  min = "0.01",
}: {
  label: string;
  name: string;
  defaultValue: string;
  step: string;
  min?: string;
}) {
  const integer = step === "1";
  return (
    <Field label={label}>
      <input
        className={inputClass}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        name={name}
        defaultValue={defaultValue}
        step={step}
        min={min}
        required
      />
    </Field>
  );
}
