import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  CreditCard,
  House,
  LogOut,
  UserRound,
  WalletCards,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { Brand } from "@/components/dashboard-shell";
import { CustomerNotificationBell } from "@/components/customer-notification-bell";
import { MobileNavScrollEnhancer } from "@/components/mobile-nav-scroll-enhancer";

const nav = [
  { label: "Início", href: "/cliente", icon: House },
  { label: "Mensalidade", href: "/cliente/mensalidade", icon: CalendarDays },
  { label: "Estadias", href: "/cliente/estadias", icon: CarFront },
  { label: "Veículos", href: "/cliente/veiculos", icon: WalletCards },
  { label: "Pagamentos", href: "/cliente/pagamentos", icon: CreditCard },
  { label: "Minha conta", href: "/cliente/conta", icon: UserRound },
];

export function CustomerShell({
  name,
  active,
  children,
  unreadNotifications = 0,
  wide = false,
}: {
  name: string;
  active: string;
  children: React.ReactNode;
  unreadNotifications?: number;
  wide?: boolean;
}) {
  const initial = (name.trim()[0] ?? "C").toUpperCase();
  const widthClass = wide ? "max-w-[1320px]" : "max-w-[1120px]";

  return (
    <main className="min-h-dvh overflow-x-hidden bg-slate-100 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-slate-950 md:pb-8">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className={`mx-auto flex h-[72px] min-w-0 items-center justify-between gap-2 px-3 sm:px-4 ${widthClass}`}>
          <Brand href="/cliente" />
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <CustomerNotificationBell unread={unreadNotifications} />
            <Link
              href="/cliente/conta"
              className="flex items-center gap-2 rounded-xl px-1.5 py-2 text-sm font-semibold hover:bg-slate-50 sm:px-2"
            >
              <span className="grid size-9 place-items-center rounded-full bg-blue-50 text-blue-700">{initial}</span>
              <span className="hidden sm:inline">{name || "Cliente"}</span>
            </Link>
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
        <nav
          aria-label="Navegação do cliente"
          className={`mx-auto hidden gap-1 overflow-x-auto px-4 pb-3 md:flex ${widthClass}`}
        >
          {nav.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active === label ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                active === label ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className={`mx-auto min-w-0 px-3 py-5 sm:px-4 sm:py-8 ${widthClass}`}>{children}</div>

      <nav
        id="mobile-nav-cliente"
        aria-label="Navegação móvel do cliente"
        className="mobile-nav-scroll fixed inset-x-0 bottom-0 z-40 flex h-[calc(4.5rem+env(safe-area-inset-bottom))] items-center gap-1.5 overflow-x-auto overscroll-x-contain border-t bg-white px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,.08)] md:hidden"
      >
        {nav.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === label ? "page" : undefined}
            className={`flex h-[58px] w-[82px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[10px] font-semibold transition ${
              active === label ? "bg-blue-50 text-blue-700" : "text-slate-500"
            }`}
          >
            <Icon className="size-5" />
            <span className="w-full truncate text-center">{label}</span>
          </Link>
        ))}
      </nav>
      <MobileNavScrollEnhancer navId="mobile-nav-cliente" storageKey="starcarvalhos:mobile-nav:cliente" hideAt="md" />
    </main>
  );
}
