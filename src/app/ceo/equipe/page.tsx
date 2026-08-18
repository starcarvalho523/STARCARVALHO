import { Search, ShieldCheck, ShieldOff, UserPlus, UsersRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import {
  canInvite,
  canManageEmployeeRole,
  requireCapability,
  type EmployeeRole,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccessAction } from "./access-action";
import { InviteForm } from "./invite-form";

const roleName: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  operator: "Frentista",
  finance: "Financeiro",
  auditor: "Auditor",
};

const roleTone: Record<string, string> = {
  owner: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
  manager: "bg-violet-50 text-violet-700 ring-violet-600/10",
  operator: "bg-blue-50 text-blue-700 ring-blue-600/10",
  finance: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  auditor: "bg-slate-100 text-slate-700 ring-slate-500/10",
};

const assignableRoles: EmployeeRole[] = ["operator", "manager", "finance", "auditor"];
export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; unit?: string; role?: string; status?: string }>;
}) {
  const query = await searchParams;
  const access = await requireCapability("team:view");
  const supabase = await createClient();
  const unitIds = [
    ...new Set(
      access.assignments
        .filter((assignment) => ["owner", "manager"].includes(String(assignment.role)))
        .map((assignment) => assignment.unit_id as string),
    ),
  ];

  const [{ data: units }, { data: roles }, { data: invitations }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase
      .from("user_unit_roles")
      .select("user_id,unit_id,role,is_active,created_at,updated_at,disabled_at")
      .in("unit_id", unitIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("employee_invitations")
      .select("email,auth_user_id,unit_id,role,status,invited_at")
      .in("unit_id", unitIds)
      .order("invited_at", { ascending: false }),
  ]);

  const userIds = [...new Set((roles ?? []).map((role) => role.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id,full_name,is_active").in("id", userIds)
    : { data: [] };

  const byUser = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const byUnit = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const invitationEmail = new Map<string, string>();
  for (const invitation of invitations ?? []) {
    if (!invitation.auth_user_id) continue;
    const key = `${invitation.auth_user_id}:${invitation.unit_id}:${invitation.role}`;
    if (!invitationEmail.has(key)) invitationEmail.set(key, invitation.email);
  }

  const inviteUnits = (units ?? [])
    .map((unit) => {
      const actorUnitRoles = access.assignments
        .filter((assignment) => assignment.unit_id === unit.id)
        .map((assignment) => assignment.role as EmployeeRole);
      const allowedRoles = assignableRoles.filter((role) => canInvite(actorUnitRoles, role));
      return { ...unit, allowedRoles };
    })
    .filter((unit) => unit.allowedRoles.length > 0);

  const normalizedQ = (query.q ?? "").trim().toLowerCase();
  const filtered = (roles ?? []).filter((row) => {
    const profile = byUser.get(row.user_id);
    const email = invitationEmail.get(`${row.user_id}:${row.unit_id}:${row.role}`) ?? "";
    const status = profile?.is_active === false ? "account_blocked" : row.is_active ? "active" : "blocked";
    const haystack = `${profile?.full_name ?? "Usuário convidado"} ${email}`.toLowerCase();
    return (
      (!normalizedQ || haystack.includes(normalizedQ)) &&
      (!query.unit || query.unit === "all" || row.unit_id === query.unit) &&
      (!query.role || query.role === "all" || row.role === query.role) &&
      (!query.status || query.status === "all" || status === query.status)
    );
  });

  const peopleCount = new Set((roles ?? []).map((row) => row.user_id)).size;
  const activeAccesses = (roles ?? []).filter((row) => row.is_active && byUser.get(row.user_id)?.is_active !== false).length;
  const blockedAccesses = (roles ?? []).filter((row) => !row.is_active).length;
  const pendingInvites = (invitations ?? []).filter((invitation) => invitation.status === "pending").length;

  return (
    <DashboardShell nav={ceoNav} active="Equipe" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader
          title="Equipe e acessos"
          description="Gerencie pessoas, funções e permissões por unidade sem apagar o histórico."
        >
          <InviteForm units={inviteUnits} />
        </CeoPageHeader>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Pessoas" value={String(peopleCount)} icon={UsersRound} tone="blue" />
          <Metric label="Acessos ativos" value={String(activeAccesses)} icon={ShieldCheck} tone="green" />
          <Metric label="Acessos bloqueados" value={String(blockedAccesses)} icon={ShieldOff} tone="red" />
          <Metric label="Convites pendentes" value={String(pendingInvites)} icon={UserPlus} tone="violet" />
        </section>

        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <Search className="size-4 shrink-0 text-slate-400" />
            <span className="sr-only">Buscar pessoa ou e-mail</span>
            <input name="q" defaultValue={query.q} placeholder="Buscar pessoa ou e-mail" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <select name="unit" defaultValue={query.unit ?? "all"} className={filterClass}>
            <option value="all">Todas as unidades</option>
            {(units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
          <select name="role" defaultValue={query.role ?? "all"} className={filterClass}>
            <option value="all">Todas as funções</option>
            <option value="owner">Proprietário</option>
            <option value="manager">Gerente</option>
            <option value="operator">Frentista</option>
            <option value="finance">Financeiro</option>
            <option value="auditor">Auditor</option>
          </select>
          <select name="status" defaultValue={query.status ?? "all"} className={filterClass}>
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="blocked">Bloqueados</option>
            <option value="account_blocked">Conta inativa</option>
          </select>
          <button className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Filtrar</button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-extrabold text-slate-950">Acessos por unidade</h2>
              <p className="mt-0.5 text-xs text-slate-500">{filtered.length} {filtered.length === 1 ? "vínculo encontrado" : "vínculos encontrados"}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Pessoa</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Função</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const profile = byUser.get(row.user_id);
                  const name = profile?.full_name ?? "Usuário convidado";
                  const email = invitationEmail.get(`${row.user_id}:${row.unit_id}:${row.role}`);
                  const unitName = byUnit.get(row.unit_id) ?? "Unidade";
                  const accountActive = profile?.is_active !== false;
                  const rowActive = Boolean(row.is_active) && accountActive;
                  const actorUnitRoles = access.assignments
                    .filter((assignment) => assignment.unit_id === row.unit_id)
                    .map((assignment) => assignment.role as EmployeeRole);
                  const manageable =
                    row.user_id !== access.user.id &&
                    accountActive &&
                    canManageEmployeeRole(actorUnitRoles, row.role as EmployeeRole);
                  const protectedAccess = row.role === "owner" || row.user_id === access.user.id;

                  return (
                    <tr key={`${row.user_id}-${row.unit_id}-${row.role}`} className="transition hover:bg-slate-50/60">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-extrabold text-blue-700">{name.charAt(0).toUpperCase()}</span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-950">{name}</p>
                            {email ? <p className="mt-0.5 truncate text-xs text-slate-400">{email}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{unitName}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${roleTone[String(row.role)] ?? roleTone.auditor}`}>{roleName[String(row.role)] ?? row.role}</span>
                      </td>
                      <td className="px-4 py-4">
                        {!accountActive ? (
                          <Status label="Conta inativa" tone="red" />
                        ) : rowActive ? (
                          <Status label="Ativo" tone="green" />
                        ) : (
                          <Status label="Bloqueado nesta unidade" tone="amber" />
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {manageable ? (
                          <AccessAction
                            userId={row.user_id}
                            unitId={row.unit_id}
                            role={String(row.role)}
                            userName={name}
                            unitName={unitName}
                            roleLabel={roleName[String(row.role)] ?? String(row.role)}
                            active={Boolean(row.is_active)}
                          />
                        ) : protectedAccess ? (
                          <span className="text-xs font-semibold text-slate-400">Acesso protegido</span>
                        ) : !accountActive ? (
                          <span className="text-xs font-semibold text-slate-400">Revisão da conta</span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">Sem permissão</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">Nenhum acesso encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou convide um novo membro.</p></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

const filterClass = "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof UsersRound; tone: "blue" | "green" | "red" | "violet" }) {
  const palette = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${palette}`}><Icon className="size-4.5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p></div></div></article>;
}

function Status({ label, tone }: { label: string; tone: "green" | "amber" | "red" }) {
  const palette = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${palette}`}>{label}</span>;
}
