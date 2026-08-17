import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, CircleHelp, LogOut, ParkingSquare } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { MobileNavScrollEnhancer } from "@/components/mobile-nav-scroll-enhancer";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
};
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Ir para o painel principal"
      className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
        <ParkingSquare className="size-5" />
      </span>
      <span className="hidden whitespace-nowrap text-xl font-bold text-slate-950 min-[420px]:inline">Star Carvalhos</span>
    </Link>
  );
}
export function DashboardShell({
  nav,
  active,
  role,
  children,
  aside,
}: {
  nav: NavItem[];
  active: string;
  role: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const home =
    role === "CEO" ? "/ceo" : role === "Frentista" ? "/frentista" : "/cliente";
  const mobileNavId = role === "CEO" ? "mobile-nav-ceo" : "mobile-nav-frentista";
  const mobileStorageKey = role === "CEO" ? "starcarvalhos:mobile-nav:ceo" : "starcarvalhos:mobile-nav:frentista";
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f7f9fd] pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-slate-950 lg:pb-0">
      <header className="sticky top-0 z-30 h-[74px] border-b bg-white/95 backdrop-blur">
        <div className="flex h-full min-w-0 items-center justify-between gap-2 px-3 sm:px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-4 lg:gap-7">
            <Brand href={home} />
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:flex">
              <i className="size-2 rounded-full bg-emerald-500" />
              Sistema operacional
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            <Link
              href={home}
              aria-label={`Ir para o painel ${role}`}
              className="flex items-center gap-2 rounded-xl px-1.5 py-2 text-sm font-semibold hover:bg-slate-50 sm:px-2"
            >
              <span className="grid size-8 place-items-center rounded-full bg-blue-50 text-blue-700">
                {role[0]}
              </span>
              <span className="hidden sm:inline">{role}</span>
            </Link>
            {role === "CEO" ? (
              <Link
                href="/ceo/alertas"
                aria-label="Ver alertas"
                className="grid size-9 place-items-center rounded-full hover:bg-slate-100 sm:size-10"
              >
                <Bell className="size-5" />
              </Link>
            ) : role !== "Frentista" ? (
              <ActionButton
                aria-label="Ver notificações"
                feedback="Você não possui novas notificações."
                className="grid size-9 place-items-center rounded-full hover:bg-slate-100 sm:size-10"
              >
                <Bell className="size-5" />
              </ActionButton>
            ) : null}
            <form action={logout}>
              <button
                aria-label="Sair da conta"
                title="Sair"
                className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600 sm:size-10"
              >
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex min-w-0">
        <aside className="sticky top-[74px] hidden h-[calc(100dvh-74px)] w-[240px] shrink-0 flex-col overflow-y-auto border-r bg-white p-4 lg:flex">
          <Navigation nav={nav} active={active} />
          <div className="mt-auto pt-4">
            {aside ?? (
              <div className="rounded-xl border bg-slate-50 p-4 text-xs text-slate-500">
                <CircleHelp className="mb-2 size-5 text-blue-600" />
                Central de ajuda e suporte.
              </div>
            )}
          </div>
        </aside>
        <main id="conteudo" className="min-w-0 max-w-full flex-1 overflow-x-hidden p-3 sm:p-6 xl:p-7">
          {children}
        </main>
      </div>
      <nav
        id={mobileNavId}
        aria-label="Navegação móvel"
        className="mobile-nav-scroll fixed inset-x-0 bottom-0 z-40 flex h-[calc(4.5rem+env(safe-area-inset-bottom))] items-center gap-1.5 overflow-x-auto overscroll-x-contain border-t bg-white px-2 pr-12 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,.08)] lg:hidden"
      >
        {nav.map(({ label, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            aria-current={active === label ? "page" : undefined}
            className={cn(
              "flex h-[58px] w-[78px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold transition",
              active === label ? "bg-blue-50 text-blue-700" : "text-slate-500",
            )}
          >
            <Icon className="size-5" />
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        ))}
      </nav>
      <MobileNavScrollEnhancer navId={mobileNavId} storageKey={mobileStorageKey} hideAt="lg" />
    </div>
  );
}
function Navigation({ nav, active }: { nav: NavItem[]; active: string }) {
  return (
    <nav aria-label="Navegação principal" className="space-y-1">
      {nav.map(({ label, href, icon: Icon, group }, i) => (
        <div key={label}>
          {group && (i === 0 || nav[i - 1].group !== group) ? (
            <p className="mb-1 mt-3 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {group}
            </p>
          ) : null}
          <Link
            href={href}
            aria-current={active === label ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-blue-600",
              active === label
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <Icon className="size-[18px]" />
            {label}
          </Link>
        </div>
      ))}
    </nav>
  );
}
