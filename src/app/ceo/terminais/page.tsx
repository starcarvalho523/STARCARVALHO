import {
  BadgeCheck,
  CircleAlert,
  CircleDotDashed,
  CreditCard,
  Info,
  Landmark,
  MonitorCog,
  RadioTower,
  Smartphone,
  WalletCards,
  WifiOff,
  Wrench,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Terminal = {
  id: string;
  unit_id: string;
  name: string;
  status: string;
  operating_mode: string | null;
  enabled: boolean;
};

export default async function TerminalsPage() {
  const supabase = await createClient();
  const [{ data: units }, { data: terminals }] = await Promise.all([
    supabase.from("parking_units").select("id,name").order("name"),
    supabase
      .from("payment_terminals")
      .select("id,unit_id,name,status,operating_mode,enabled")
      .eq("provider", "MERCADO_PAGO")
      .order("name"),
  ]);

  const terminalRows = (terminals ?? []) as Terminal[];

  return (
    <DashboardShell nav={ceoNav} active="Terminais" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <CeoPageHeader
          title="Terminais de pagamento"
          description="Preparação administrativa por unidade. Nenhuma cobrança Point está habilitada."
        />

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.35fr_.65fr]">
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <Smartphone className="size-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-extrabold text-slate-950">Integração com Mercado Pago Point</h2>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                      <CircleDotDashed className="size-3.5" />
                      Aguardando configuração
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Para iniciar recebimentos pelo Point, é necessário concluir a configuração e a homologação com um terminal físico.
                  </p>
                  <div className="mt-4 flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
                    <p>
                      A integração permitirá enviar o valor oficial da estadia à maquininha e receber a confirmação do pagamento. Nesta fase não há botão de cobrança nem comunicação ativa com o Mercado Pago.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="border-t border-slate-100 bg-slate-50/50 p-5 sm:p-6 lg:border-l lg:border-t-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Como funciona</p>
              <ol className="mt-4 space-y-3 text-sm text-slate-600">
                <Step text="Conectar um terminal físico Point" />
                <Step text="Realizar a configuração do modo PDV" />
                <Step text="Concluir a homologação da integração" />
                <Step text="Habilitar os recebimentos presenciais" />
              </ol>
            </aside>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          {(units ?? []).map((unit) => {
            const list = terminalRows.filter((terminal) => terminal.unit_id === unit.id);
            const hasTerminal = list.length > 0;
            const pdvConfigured = list.some((terminal) => terminal.operating_mode === "PDV");
            const enabledTerminal = list.some((terminal) => terminal.enabled);
            const connectedTerminal = list.some((terminal) => {
              const status = terminal.status?.toUpperCase();
              return status === "CONNECTED" || status === "ONLINE" || status === "ACTIVE";
            });

            const terminalValue = hasTerminal ? list.map((terminal) => terminal.name).join(", ") : "Não conectado";
            const terminalDescription = hasTerminal
              ? connectedTerminal
                ? "Terminal cadastrado e com status de conexão reconhecido."
                : "Terminal cadastrado, mas ainda sem conexão operacional confirmada."
              : "Nenhum terminal físico está conectado ou homologado.";

            return (
              <section key={unit.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                      <Landmark className="size-4" />
                    </span>
                    <div>
                      <h2 className="font-extrabold text-slate-950">{unit.name}</h2>
                      <p className="text-xs text-slate-400">Configuração presencial da unidade</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${enabledTerminal ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {enabledTerminal ? "Habilitado" : "Não habilitado"}
                  </span>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <StatusCard
                    icon={connectedTerminal ? RadioTower : WifiOff}
                    label="Terminal"
                    value={terminalValue}
                    description={terminalDescription}
                    tone={connectedTerminal ? "green" : "red"}
                  />
                  <StatusCard
                    icon={MonitorCog}
                    label="Modo PDV"
                    value={pdvConfigured ? "Identificado" : "Não configurado"}
                    description={pdvConfigured ? "Modo PDV identificado, ainda sujeito à habilitação da integração." : "Configure e homologue o modo PDV antes de iniciar recebimentos."}
                    tone={pdvConfigured ? "blue" : "red"}
                  />
                  <StatusCard
                    icon={WalletCards}
                    label="Débito presencial"
                    value="Indisponível"
                    description="Aguardando configuração, homologação e habilitação do terminal."
                    tone="slate"
                  />
                  <StatusCard
                    icon={CreditCard}
                    label="Crédito presencial"
                    value="Indisponível"
                    description="Aguardando configuração, homologação e habilitação do terminal."
                    tone="slate"
                  />
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-xs text-slate-500">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-blue-500" />
                    <p>Os recebimentos presenciais permanecerão bloqueados até a integração real ser configurada e homologada.</p>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="A configuração real do terminal ainda não está disponível nesta fase."
                    className="inline-flex h-10 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 text-sm font-bold text-slate-500"
                  >
                    <Wrench className="size-4" />
                    Configuração indisponível
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}

function Step({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
        <BadgeCheck className="size-3.5" />
      </span>
      <span>{text}</span>
    </li>
  );
}

type StatusTone = "green" | "blue" | "red" | "slate";

function StatusCard({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  description: string;
  tone: StatusTone;
}) {
  const palette = {
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  const badge = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${palette}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <span className={`mt-2 inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>
            <span className="truncate">{value}</span>
          </span>
          <p className="mt-3 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
    </article>
  );
}
