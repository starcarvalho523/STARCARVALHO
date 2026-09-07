import Link from "@/components/global-link";
import { ArrowLeft, Building2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export const dynamic = "force-dynamic";

export default async function NewUnitPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await requireCeoScope("admin");
  const query = await searchParams;

  return (
    <DashboardShell nav={ceoNav} active="Unidades" role="CEO">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href="/ceo/unidades" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"><ArrowLeft className="size-3.5" />Voltar para unidades</Link>
        <CeoPageHeader title="Nova unidade" description="Cadastre uma nova operação e deixe o acesso administrativo vinculado ao seu usuário." />
        {query.erro ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.erro}</div> : null}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800"><div className="flex gap-3"><Building2 className="mt-0.5 size-4.5 shrink-0" /><p>A nova unidade será criada sem apagar nem alterar os dados das unidades existentes. Você poderá editar capacidade, área, custo fixo e status depois.</p></div></div>
        <UnitForm action={createUnit} submitLabel="Criar unidade" cancelHref="/ceo/unidades" />
      </div>
    </DashboardShell>
  );
}
