import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, type LucideIcon } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";

export type SectionDefinition = { title: string; description: string; icon: LucideIcon; highlights: string[] };

export function AreaSectionPage({ role, active, nav, section, home }: { role: string; active: string; nav: NavItem[]; section: SectionDefinition; home: string }) {
  const Icon = section.icon;
  return <DashboardShell nav={nav} active={active} role={role}><div className="mx-auto max-w-6xl space-y-6">
    <Link href={home} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft className="size-4" />Voltar ao painel</Link>
    <section className="rounded-3xl border bg-gradient-to-br from-white to-blue-50 p-6 shadow-sm sm:p-8"><span className="grid size-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg"><Icon className="size-7" /></span><h1 className="mt-5 text-3xl font-bold">{section.title}</h1><p className="mt-2 max-w-2xl text-slate-500">{section.description}</p></section>
    <div className="grid gap-4 md:grid-cols-3">{section.highlights.map((item, index) => <article key={item} className="rounded-2xl border bg-white p-5 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">{index === 2 ? <Clock3 className="size-5" /> : <CheckCircle2 className="size-5" />}</span><h2 className="mt-4 font-bold">{item}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Nenhum dado real disponível para este módulo no momento.</p></article>)}</div>
    <section className="rounded-2xl border bg-slate-50 p-5"><h2 className="font-bold">Estado atual</h2><p className="mt-1 text-sm text-slate-600">Esta área não apresenta exemplos ou métricas fictícias. Os registros aparecerão somente quando existirem no Supabase.</p></section>
  </div></DashboardShell>;
}

