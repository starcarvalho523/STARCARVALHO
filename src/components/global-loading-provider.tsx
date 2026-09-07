"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { beginGlobalLoading } from "@/lib/global-loading-store";

type Work = () => void | Promise<void>;
const LoadingContext = createContext<((work: Work) => void) | null>(null);

/** The provider survives route unmounts; React owns the RSC/refresh completion signal. */
export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const releases = useRef(new Set<() => void>());
  const run = useCallback((work: Work) => {
    releases.current.add(beginGlobalLoading());
    startTransition(async () => { await work(); });
  }, []);
  useLayoutEffect(() => {
    if (pending) return;
    for (const release of releases.current) release();
    releases.current.clear();
  }, [pending]);
  useLayoutEffect(() => () => {
    for (const release of releases.current) release();
    releases.current.clear();
  }, []);
  return <LoadingContext.Provider value={run}>{children}</LoadingContext.Provider>;
}

export function useGlobalTransition() {
  const run = useContext(LoadingContext);
  if (!run) throw new Error("GlobalLoadingProvider is required");
  return run;
}

/** Register until the render containing the final data/error has committed. */
export function useGlobalPending(pending: boolean) {
  useLayoutEffect(() => {
    if (pending) return beginGlobalLoading();
  }, [pending]);
}

export function useGlobalRouter() {
  const router = useRouter();
  const run = useGlobalTransition();
  return useMemo(() => ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => run(() => router.push(...args)),
    replace: (...args: Parameters<typeof router.replace>) => run(() => router.replace(...args)),
    refresh: () => run(() => router.refresh()),
  }), [router, run]);
}
