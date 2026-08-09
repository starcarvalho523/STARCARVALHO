"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  feedback?: string;
};

export function ActionButton({ children, feedback = "Ação concluída.", className, onClick, ...props }: ActionButtonProps) {
  const [message, setMessage] = useState("");
  return <>
    <button {...props} className={cn("transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50", className)} onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        setMessage(feedback);
        window.setTimeout(() => setMessage(""), 2600);
      }
    }}>{children}</button>
    {message ? <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><CheckCircle2 className="size-5 text-emerald-400" />{message}</div> : null}
  </>;
}




