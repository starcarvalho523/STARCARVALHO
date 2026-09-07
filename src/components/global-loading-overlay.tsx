"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { adaptiveProgress, globalLoadingStore, MIN_VISIBLE_MS, FINISH_ANIMATION_MS } from "@/lib/global-loading-store";

export function GlobalLoadingOverlay() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let startedAt: number | null = null;
    let finishAt: number | null = null;
    let finishFrom = 0;
    let readyFrames = 0;
    const tick = (now: number) => {
      if (startedAt === null) return;
      setVisible(true);
      const pending = globalLoadingStore.getSnapshot() > 0;
      const elapsed = now - startedAt;
      if (pending) {
        finishAt = null;
        readyFrames = 0;
      } else {
        readyFrames += 1;
      }
      // Two paint opportunities after the final React commit, not a network-idle timeout.
      if (!pending && readyFrames >= 2 && elapsed >= MIN_VISIBLE_MS) {
        if (finishAt === null) {
          finishAt = now;
          finishFrom = adaptiveProgress(elapsed);
        }
        const fraction = Math.min(1, (now - finishAt) / FINISH_ANIMATION_MS);
        if (fraction === 1 && globalLoadingStore.getSnapshot() === 0) {
          setProgress(100);
          setVisible(false);
          startedAt = null;
          frame = 0;
          return;
        }
        setProgress(reducedMotion ? 0 : finishFrom + (100 - finishFrom) * (1 - Math.pow(1 - fraction, 3)));
      } else {
        setProgress(reducedMotion ? 0 : adaptiveProgress(elapsed));
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (globalLoadingStore.getSnapshot() === 0 || startedAt !== null) return;
      startedAt = performance.now();
      finishAt = null;
      readyFrames = 0;
      frame = requestAnimationFrame(tick);
    };
    const unsubscribe = globalLoadingStore.subscribe(start);
    start();
    return () => { unsubscribe(); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (!visible || !overlay.current) return;
    const node = overlay.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousBusy = document.body.getAttribute("aria-busy");
    const inert = new Map<HTMLElement, boolean>();
    const blockSiblings = () => {
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement) || child === node || child.contains(node) || inert.has(child)) continue;
        inert.set(child, child.inert);
        child.inert = true;
      }
    };
    blockSiblings();
    const observer = new MutationObserver(blockSiblings);
    observer.observe(document.body, { childList: true });
    document.body.style.overflow = "hidden";
    document.body.setAttribute("aria-busy", "true");
    node.focus({ preventScroll: true });
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !node.contains(event.target)) node.focus({ preventScroll: true });
    };
    const blockKeys = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("focusin", keepFocus, true);
    document.addEventListener("keydown", blockKeys, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", keepFocus, true);
      document.removeEventListener("keydown", blockKeys, true);
      inert.forEach((value, element) => { element.inert = value; });
      document.body.style.overflow = previousOverflow;
      if (previousBusy === null) document.body.removeAttribute("aria-busy");
      else document.body.setAttribute("aria-busy", previousBusy);
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus({ preventScroll: true });
    };
  }, [visible]);

  if (!visible) return null;

  const circumference = 2 * Math.PI * 58;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div ref={overlay} tabIndex={-1} className="star-loader-overlay" role="status" aria-live="polite" aria-label="Atualizando dados da plataforma">
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
          <p className="star-loader-subtitle">Atualizando dados da plataforma</p>
        </div>
        <div className="star-loader-dots" aria-hidden="true"><span /><span className="is-active" /><span /></div>
        <div className="star-loader-brand" aria-hidden="true"><strong>STAR CARVALHOS</strong><span>MAIS CONTROLE PARA O SEU ESTACIONAMENTO</span></div>
      </div>
    </div>
  );
}
