"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_VISIBLE_MS = 680;
const NETWORK_SETTLE_MS = 100;
const FINISH_ANIMATION_MS = 180;

type LoadingReason = "navigation" | "filter" | "action" | "data";

function labelFor(reason: LoadingReason) {
  if (reason === "filter") return "Atualizando filtros";
  if (reason === "action") return "Salvando alterações";
  if (reason === "data") return "Atualizando dados";
  return "Carregando página";
}

export function GlobalLoadingOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reason, setReason] = useState<LoadingReason>("navigation");

  const visibleRef = useRef(false);
  const progressRef = useRef(0);
  const startedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestsRef = useRef(0);
  const awaitingRouteRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    hideTimerRef.current = null;
    settleTimerRef.current = null;
  }, []);

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const animateAdaptiveProgress = useCallback(() => {
    stopFrame();

    const tick = () => {
      if (!visibleRef.current) return;
      const elapsed = performance.now() - startedAtRef.current;
      let target: number;

      if (elapsed < 500) {
        target = 12 + elapsed * 0.105;
      } else if (elapsed < 1800) {
        target = 64 + (elapsed - 500) * 0.017;
      } else {
        target = Math.min(94, 86 + (elapsed - 1800) * 0.0022);
      }

      const next = Math.min(94, progressRef.current + (target - progressRef.current) * 0.11);
      progressRef.current = next;
      setProgress(next);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [stopFrame]);

  const begin = useCallback((nextReason: LoadingReason, awaitsRoute = false) => {
    clearTimers();
    awaitingRouteRef.current = awaitingRouteRef.current || awaitsRoute;
    setReason(nextReason);

    if (visibleRef.current) return;

    visibleRef.current = true;
    startedAtRef.current = performance.now();
    progressRef.current = 8;
    setProgress(8);
    setVisible(true);
    animateAdaptiveProgress();
  }, [animateAdaptiveProgress, clearTimers]);

  const finishAndReveal = useCallback(() => {
    stopFrame();
    progressRef.current = 100;
    setProgress(100);

    // O overlay some exatamente ao terminar o trecho visual até 100%.
    // Não existe espera adicional depois que a animação conclui.
    hideTimerRef.current = setTimeout(() => {
      visibleRef.current = false;
      setVisible(false);
      setProgress(0);
    }, FINISH_ANIMATION_MS);
  }, [stopFrame]);

  const complete = useCallback(() => {
    if (!visibleRef.current) return;
    if (activeRequestsRef.current > 0 || awaitingRouteRef.current) return;

    const elapsed = performance.now() - startedAtRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    clearTimers();
    hideTimerRef.current = setTimeout(finishAndReveal, wait);
  }, [clearTimers, finishAndReveal]);

  const scheduleComplete = useCallback(() => {
    if (activeRequestsRef.current > 0 || awaitingRouteRef.current) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(complete, NETWORK_SETTLE_MS);
  }, [complete]);

  const routeCommitted = useCallback(() => {
    if (!visibleRef.current) return;
    awaitingRouteRef.current = false;
    scheduleComplete();
  }, [scheduleComplete]);

  useEffect(() => {
    routeCommitted();
  }, [pathname, routeCommitted]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isStatic = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?)(?:\?|$)/i.test(url);
      const isWebhook = url.includes("/api/webhooks/");
      const shouldTrack = !isStatic && !isWebhook;

      if (!shouldTrack) return originalFetch(...args);

      activeRequestsRef.current += 1;
      begin(method === "GET" ? "data" : "action");

      try {
        return await originalFetch(...args);
      } finally {
        activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);
        scheduleComplete();
      }
    };

    history.pushState = (...args: Parameters<History["pushState"]>) => {
      originalPushState(...args);
      routeCommitted();
    };

    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      originalReplaceState(...args);
      routeCommitted();
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;

      const next = new URL(target.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search && next.hash) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;

      begin(next.pathname === window.location.pathname ? "filter" : "navigation", true);
    };

    const onSubmit = (event: SubmitEvent) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      const method = (event.target.method || "get").toLowerCase();
      begin(method === "get" ? "filter" : "action", method === "get");
    };

    const onPopState = () => {
      begin("navigation", true);
      requestAnimationFrame(routeCommitted);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.fetch = originalFetch;
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
      stopFrame();
    };
  }, [begin, clearTimers, routeCommitted, scheduleComplete, stopFrame]);

  if (!visible) return null;

  const circumference = 2 * Math.PI * 58;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="star-loader-overlay" role="status" aria-live="polite" aria-label={`${labelFor(reason)}. ${Math.round(progress)}%`}>
      <div className="star-loader-backdrop" aria-hidden="true" />
      <div className="star-loader-card">
        <div className="star-loader-orbit" aria-hidden="true">
          <svg viewBox="0 0 132 132" className="star-loader-ring">
            <circle cx="66" cy="66" r="58" className="star-loader-track" />
            <circle cx="66" cy="66" r="58" className="star-loader-progress" style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }} />
          </svg>
          <span className="star-loader-dot" style={{ transform: `rotate(${progress * 3.6}deg) translateY(-58px)` }} />
          <span className="star-loader-logo-wrap">
            <Image src="/star-carvalhos-loader-logo.svg" alt="" width={96} height={96} priority className="star-loader-logo" />
          </span>
        </div>
        <div className="star-loader-copy">
          <p className="star-loader-title">Carregando...</p>
          <p className="star-loader-subtitle">{labelFor(reason)} da plataforma</p>
        </div>
        <div className="star-loader-dots" aria-hidden="true"><span /><span className="is-active" /><span /></div>
        <div className="star-loader-brand" aria-hidden="true"><strong>STAR CARVALHOS</strong><span>MAIS CONTROLE PARA O SEU ESTACIONAMENTO</span></div>
      </div>
    </div>
  );
}
