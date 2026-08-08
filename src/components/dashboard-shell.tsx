import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, CircleHelp, LogOut, ParkingSquare } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";

export type NavItem = { label: string; href: string; icon: LucideIcon };

export function Brand({ href = "/" }: { href?: string }) {
  return <Link href={href} aria-label="Ir para o painel principal" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
    <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg"><ParkingSquare className="size-5" /></span>
    <span className="text-xl font-bold text-slate-950">Star Cavalos</span>
  </Link>;
}

export function DashboardShell({ nav, active, role, children, aside }: { nav: NavItem[]; active: string; role: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const homeHref = role === "CEO" ? "/ceo" : role === "Frentista" ? "/frentista" : "/cliente";
  return <div className="min-h-screen bg-[#f7f9fd] pb-20 text-slate-950 lg:pb-0">
    <header className="sticky top-0 z-30 h-[74px] border-b bg-white/95 backdrop-blur">
      <div className="flex h-full items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-7"><Brand href={homeHref} /><span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:flex"><i className="size-2 rounded-full bg-emerald-500" />Modo demonstração</span></div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href={homeHref} aria-label={`Ir para o painel ${role}`} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold hover:bg-slate-50"><span className="grid size-8 place-items-center rounded-full bg-blue-50 text-blue-700">{role[0]}</span><span className="hidden sm:inline">{role}</span></Link>
          <ActionButton aria-label="Ver notificações" feedback="Você não possui novas notificações." className="relative grid size-10 place-items-center rounded-full hover:bg-slate-100"><Bell className="size-5" /><i className="absolute right-1.5 top-1.5 size-2 rounded-full bg-blue-600 ring-2 ring-white" /></ActionButton>
          <form action={logout}><button aria-label="Sair da conta" title="Sair" className="grid size-10 place-items-center rounded-full text-slate-500 transition hover:bg-red-50 hover:text-red-600"><LogOut className="size-5" /></button></form>
        </div>
      </div>
    </header>
    <div className="flex">
      <aside className="sticky top-[74px] hidden h-[calc(100vh-74px)] w-[240px] shrink-0 flex-col border-r bg-white p-4 lg:flex">
        <Navigation nav={nav} active={active} />
        <div className="mt-auto">{aside ?? <div className="rounded-xl border bg-slate-50 p-4 text-xs text-slate-500"><CircleHelp className="mb-2 size-5 text-blue-600" />Central de ajuda e suporte.</div>}</div>
      </aside>
      <main id="conteudo" className="min-w-0 flex-1 p-4 sm:p-6 xl:p-7">{children}</main>
    </div>
    <nav aria-label="Navegação móvel" className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center gap-1 overflow-x-auto border-t bg-white px-2 shadow-[0_-8px_24px_rgba(15,23,42,.08)] lg:hidden">
      {nav.slice(0, 5).map(({ label, href, icon: Icon }) => <Link key={label} href={href} className={cn("flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold", active === label ? "bg-blue-50 text-blue-700" : "text-slate-500")}><Icon className="size-5" /><span className="max-w-[76px] truncate">{label}</span></Link>)}
    </nav>
  </div>;
}

function Navigation({ nav, active }: { nav: NavItem[]; active: string }) {
  return <nav aria-label="Navegação principal" className="space-y-1">{nav.map(({ label, href, icon: Icon }) => <Link key={label} href={href} aria-current={active === label ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-blue-600", active === label ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}><Icon className="size-[18px]" />{label}</Link>)}</nav>;
}

export function DemoNotice() {
  return <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Dados demonstrativos</span>;
}






