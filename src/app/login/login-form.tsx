"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { login, type LoginState } from "./actions";
import { signInWithGoogle } from "@/app/cadastro/actions";
const initialState: LoginState = { error: "" };
export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);
  return <form action={action} className="space-y-5">
    <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label><div className="flex h-12 items-center rounded-xl border bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"><Mail className="size-5 text-slate-400" /><input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@exemplo.com" className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none" /></div></div>
    <div><div className="mb-2 flex justify-between"><label htmlFor="password" className="text-sm font-semibold text-slate-700">Senha</label><Link href="/esqueci-senha" className="text-xs font-semibold text-blue-600 hover:underline">Esqueci minha senha</Link></div><div className="flex h-12 items-center rounded-xl border bg-white px-4 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"><LockKeyhole className="size-5 text-slate-400" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} placeholder="Digite sua senha" className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none" /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div></div>
    {state.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error}</p> : null}
    <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-60">{pending ? <LoaderCircle className="size-5 animate-spin" /> : <LockKeyhole className="size-5" />}{pending ? "Validando acesso..." : "Entrar com segurança"}</button>
    <button formAction={signInWithGoogle} className="h-12 w-full rounded-xl border bg-white font-semibold hover:bg-slate-50">Continuar com Google</button>
    <p className="text-center text-sm text-slate-500">É cliente e ainda não possui conta? <Link href="/cadastro" className="font-bold text-blue-600 hover:underline">Cadastre-se</Link></p>
  </form>;
}
