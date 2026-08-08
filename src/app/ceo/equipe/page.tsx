import { Building2, Home, Users } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { requireCapability } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { disableEmployee } from "./actions";
import { InviteForm } from "./invite-form";
const nav: NavItem[] = [{ label: "Painel do CEO", href: "/ceo", icon: Home }, { label: "Unidades", href: "/ceo/unidades", icon: Building2 }, { label: "Tarifas", href: "/ceo/tarifas", icon: Building2 }, { label: "Equipe", href: "/ceo/equipe", icon: Users }];
const roleName: Record<string,string> = { owner: "Proprietário", manager: "Gerente", operator: "Frentista", finance: "Financeiro", auditor: "Auditor" };
export const dynamic = "force-dynamic";
export default async function TeamPage() {
  const access = await requireCapability("team:view"); const supabase = await createClient();
  const unitIds = [...new Set(access.assignments.filter(a => ["owner","manager"].includes(String(a.role))).map(a => a.unit_id as string))];
  const [{ data: units }, { data: roles }] = await Promise.all([supabase.from("parking_units").select("id,name").in("id", unitIds), supabase.from("user_unit_roles").select("user_id,unit_id,role").in("unit_id", unitIds)]);
  const userIds = [...new Set((roles ?? []).map(r => r.user_id))]; const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id,full_name,is_active").in("id", userIds) : { data: [] };
  const byUser = new Map((profiles ?? []).map(p => [p.id, p])); const byUnit = new Map((units ?? []).map(u => [u.id, u.name]));
  return <DashboardShell nav={nav} active="Equipe" role="CEO"><div className="mx-auto max-w-6xl space-y-5"><div><h1 className="text-3xl font-bold">Equipe e acessos</h1><p className="mt-1 text-sm text-slate-500">Convide funcionários, confira funções por unidade e bloqueie acessos sem excluir o histórico.</p></div><InviteForm units={units ?? []} canInvite={access.roles.some(r => ["owner","manager"].includes(r))} /><section className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Pessoa</th><th>Unidade</th><th>Função</th><th>Status</th><th className="pr-4 text-right">Ação</th></tr></thead><tbody>{(roles ?? []).map(r => { const p = byUser.get(r.user_id); return <tr key={`${r.user_id}-${r.unit_id}-${r.role}`} className="border-t"><td className="p-4 font-semibold">{p?.full_name ?? "Usuário convidado"}</td><td>{byUnit.get(r.unit_id)}</td><td>{roleName[String(r.role)] ?? r.role}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${p?.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{p?.is_active ? "Ativo" : "Bloqueado"}</span></td><td className="pr-4 text-right">{p?.is_active && r.user_id !== access.user.id ? <form action={disableEmployee}><input type="hidden" name="userId" value={r.user_id} /><input type="hidden" name="unitId" value={r.unit_id} /><button className="font-semibold text-red-600 hover:underline">Bloquear</button></form> : "—"}</td></tr>; })}</tbody></table></section></div></DashboardShell>;
}
