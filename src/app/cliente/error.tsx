"use client";
import Link from "next/link";
export default function ErrorPage(){return <main className="grid min-h-screen place-items-center bg-slate-100 p-4"><section className="max-w-md rounded-3xl border bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-bold">Não foi possível carregar sua área agora.</h1><p className="mt-2 text-sm text-slate-500">Tente novamente em alguns instantes. Nenhum dado foi alterado.</p><Link href="/cliente" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">Tentar novamente</Link></section></main>}

