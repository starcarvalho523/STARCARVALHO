import Link from "next/link";

export function Notice({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <div
      role="status"
      className={`rounded-2xl border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {error ?? success}
    </div>
  );
}

export function MonthlyTabs({ active }: { active: "list" | "plans" | "overdue" }) {
  return (
    <nav
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm"
      aria-label="Mensalistas"
    >
      <Tab href="/ceo/mensalistas" on={active === "list"}>
        Assinaturas
      </Tab>
      <Tab href="/ceo/mensalistas/planos" on={active === "plans"}>
        Planos
      </Tab>
      <Tab href="/ceo/mensalistas/inadimplentes" on={active === "overdue"}>
        Inadimplência
      </Tab>
    </nav>
  );
}

function Tab({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
        on
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {children}
    </Link>
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  const color =
    status === "ACTIVE" || status === "PAID"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
      : status === "PENDING_ACTIVATION"
        ? "bg-blue-50 text-blue-700 ring-blue-600/10"
        : status === "SUSPENDED" || status === "PENDING"
          ? "bg-amber-50 text-amber-700 ring-amber-600/10"
          : status === "MANUAL_REVIEW"
            ? "bg-red-50 text-red-700 ring-red-600/10"
            : "bg-slate-100 text-slate-600 ring-slate-500/10";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${color}`}
    >
      {label}
    </span>
  );
}

export const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
export const primary =
  "inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50";
export const secondary =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
