"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export function MobileNavScrollEnhancer({
  navId,
  storageKey,
  hideAt,
}: {
  navId: string;
  storageKey: string;
  hideAt: "lg" | "md";
}) {
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const nav = document.getElementById(navId);
    if (!(nav instanceof HTMLElement)) return;

    const update = () => {
      const remaining = nav.scrollWidth - nav.clientWidth - nav.scrollLeft;
      setCanScrollRight(remaining > 3);
      sessionStorage.setItem(storageKey, String(nav.scrollLeft));
    };

    const saved = Number(sessionStorage.getItem(storageKey) ?? "0");
    requestAnimationFrame(() => {
      const max = Math.max(0, nav.scrollWidth - nav.clientWidth);
      nav.scrollLeft = Math.min(Math.max(0, saved), max);
      update();
    });

    nav.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(nav);

    return () => {
      nav.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [navId, storageKey]);

  if (!canScrollRight) return null;

  return (
    <button
      type="button"
      aria-label="Ver mais opções do menu"
      onClick={() => {
        const nav = document.getElementById(navId);
        nav?.scrollBy({ left: 180, behavior: "smooth" });
      }}
      className={`fixed right-2 z-50 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-slate-900/45 text-white shadow-lg backdrop-blur-md animate-[pulse_2.2s_ease-in-out_infinite] ${
        hideAt === "lg" ? "bottom-[calc(2.25rem+env(safe-area-inset-bottom)/2)] lg:hidden" : "bottom-[calc(2.25rem+env(safe-area-inset-bottom)/2)] md:hidden"
      }`}
    >
      <ChevronRight className="size-5" strokeWidth={2.5} />
    </button>
  );
}
