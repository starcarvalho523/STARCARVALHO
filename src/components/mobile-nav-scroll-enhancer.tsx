"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useState } from "react";

export function MobileNavScrollEnhancer({
  navId,
  storageKey,
  hideAt,
}: {
  navId: string;
  storageKey: string;
  hideAt: "lg" | "md";
}) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useLayoutEffect(() => {
    const nav = document.getElementById(navId);
    if (!(nav instanceof HTMLElement)) return;

    let restored = false;

    const persist = () => {
      sessionStorage.setItem(storageKey, String(nav.scrollLeft));
    };

    const update = () => {
      const max = Math.max(0, nav.scrollWidth - nav.clientWidth);
      const left = Math.max(0, nav.scrollLeft);
      const remaining = Math.max(0, max - left);
      setCanScrollLeft(left > 3);
      setCanScrollRight(remaining > 3);
      if (restored) persist();
    };

    const persistBeforeNavigation = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a")) persist();
    };

    const saved = Number(sessionStorage.getItem(storageKey) ?? "0");
    const restore = () => {
      const max = Math.max(0, nav.scrollWidth - nav.clientWidth);
      nav.scrollLeft = Math.min(Math.max(0, Number.isFinite(saved) ? saved : 0), max);
      restored = true;
      update();
    };

    restore();
    requestAnimationFrame(restore);

    nav.addEventListener("scroll", update, { passive: true });
    nav.addEventListener("pointerdown", persistBeforeNavigation, true);
    nav.addEventListener("click", persistBeforeNavigation, true);
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(() => {
      if (restored) update();
    });
    observer.observe(nav);

    return () => {
      persist();
      nav.removeEventListener("scroll", update);
      nav.removeEventListener("pointerdown", persistBeforeNavigation, true);
      nav.removeEventListener("click", persistBeforeNavigation, true);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [navId, storageKey]);

  const responsiveClass = hideAt === "lg" ? "lg:hidden" : "md:hidden";
  const move = (direction: -1 | 1) => {
    const nav = document.getElementById(navId);
    nav?.scrollBy({ left: direction * 180, behavior: "smooth" });
  };

  return (
    <>
      {canScrollLeft ? (
        <button
          type="button"
          aria-label="Ver opções anteriores do menu"
          onClick={() => move(-1)}
          className={`fixed bottom-[calc(1.125rem+env(safe-area-inset-bottom)/2)] left-2 z-50 grid size-9 place-items-center rounded-full border border-white/70 bg-slate-900/35 text-white shadow-lg backdrop-blur-md animate-[pulse_2.2s_ease-in-out_infinite] ${responsiveClass}`}
        >
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </button>
      ) : null}
      {canScrollRight ? (
        <button
          type="button"
          aria-label="Ver mais opções do menu"
          onClick={() => move(1)}
          className={`fixed bottom-[calc(1.125rem+env(safe-area-inset-bottom)/2)] right-2 z-50 grid size-9 place-items-center rounded-full border border-white/70 bg-slate-900/35 text-white shadow-lg backdrop-blur-md animate-[pulse_2.2s_ease-in-out_infinite] ${responsiveClass}`}
        >
          <ChevronRight className="size-5" strokeWidth={2.5} />
        </button>
      ) : null}
    </>
  );
}
