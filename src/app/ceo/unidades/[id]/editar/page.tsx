import Link from "@/components/global-link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateUnit } from "../../actions";
import { UnitForm } from "../../unit-form";

export const dynamic = "force-dynamic";

export default async function EditUnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const access = await requireCeoScope("admin");
  const allowed = access.assignments.some((assignment) => String(assignment.unit_id) === id && assignment.is_active && ["owner", "manager"].includes(String(assignment.role)));
  if (!allowed) notFound();

  const admin = createAdminClient();
  const { data: unit } = await admin.from("parking_units").select("id,name,capacity,timezone,is_active,area_sqm,monthly_fixed_cost").eq("id", id).maybeSingle();
  if (!unit) notFound();

  return (
    <DashboardShell nav={ceoNav} active="Unidades" role="CEO">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href={`/ceo/unidades/${id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"><ArrowLeft className="size-3.5" />Voltar para a unidade</Link>
        <CeoPageHeader title={`Editar ${unit.name}`} description="Atualize as informações operacionais e financeiras usadas nos painéis do CEO." />
        {query.erro ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.erro}</div> : null}
        <UnitForm action={updateUnit} values={unit} submitLabel="Salvar alterações" cancelHref={`/ceo/unidades/${id}`} />
      </div>
    </DashboardShell>
  );
}
