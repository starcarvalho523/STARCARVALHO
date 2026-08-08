"use client";
import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { signup, signInWithGoogle, type SignupState } from "./actions";
const initial: SignupState = {};
export function SignupForm() {
  const [state, action, pending] = useActionState(signup, initial);
  return <div className="space-y-5">
    <form action={signInWithGoogle}><button className="h-12 w-full rounded-xl border bg-white font-semibold hover:bg-slate-50">Continuar com Google</button></form>
    <div className="flex items-center gap-3 text-xs text-slate-400"><i className="h-px flex-1 bg-slate-200" />ou use seu e-mail<i className="h-px flex-1 bg-slate-200" /></div>
    <form action={action} className="space-y-4">
      <Field label="Nome completo" name="fullName" type="text" autoComplete="name" />
      <Field label="E-mail" name="email" type="email" autoComplete="email" />
      <Field label="Senha" name="password" type="password" autoComplete="new-password" minLength={8} />
      <Field label="Confirme a senha" name="confirm" type="password" autoComplete="new-password" minLength={8} />
      {state.error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{state.success}</p> : null}
      <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white disabled:opacity-60">{pending && <LoaderCircle className="size-5 animate-spin" />}Criar conta de cliente</button>
    </form>
    <p className="text-center text-sm text-slate-500">Já possui conta? <Link href="/login" className="font-bold text-blue-600">Entrar</Link></p>
  </div>;
}
function Field(props: { label: string; name: string; type: string; autoComplete: string; minLength?: number }) { return <label className="block text-sm font-semibold text-slate-700">{props.label}<input {...props} required className="mt-2 h-12 w-full rounded-xl border px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>; }
