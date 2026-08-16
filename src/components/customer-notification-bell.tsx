"use client";

import Link from "next/link";
import { Bell, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  internal_link: string | null;
};

export function CustomerNotificationBell({ unread = 0 }: { unread?: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || items.length || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/customer/notifications", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Não foi possível carregar as notificações.");
      setItems(Array.isArray(body.notifications) ? body.notifications : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as notificações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full text-slate-600 hover:bg-blue-50 hover:text-blue-700"
      >
        <Bell className="size-5" />
        {unread ? (
          <span className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {Math.min(unread, 99)}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="fixed inset-x-3 top-20 z-50 max-h-[min(70dvh,560px)] overflow-hidden rounded-2xl border bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="font-bold">Notificações</h2>
              <p className="text-xs text-slate-500">Veja seus alertas sem sair da tela atual.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar notificações" className="grid size-9 place-items-center rounded-full hover:bg-slate-100">
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[calc(min(70dvh,560px)-112px)] overflow-y-auto p-3">
            {loading ? (
              <div className="grid min-h-28 place-items-center text-sm text-slate-500"><LoaderCircle className="size-5 animate-spin" /></div>
            ) : error ? (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
            ) : items.length ? (
              <div className="space-y-2">
                {items.map((item) => (
                  <article key={item.id} className={`rounded-xl border p-3 ${item.read_at ? "bg-white" : "border-blue-200 bg-blue-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold">{item.title}</h3>
                      {!item.read_at ? <span className="mt-1 size-2 shrink-0 rounded-full bg-blue-600" aria-label="Não lida" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <time className="text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")}</time>
                      {item.internal_link ? <Link href={item.internal_link} onClick={() => setOpen(false)} className="text-xs font-bold text-blue-600">Abrir</Link> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">Nenhuma notificação por enquanto.</p>
            )}
          </div>

          <div className="border-t bg-slate-50 p-3 text-center">
            <Link href="/cliente/notificacoes" onClick={() => setOpen(false)} className="text-sm font-bold text-blue-600">Ver central de notificações</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
