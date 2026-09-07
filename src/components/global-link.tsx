"use client";

import NextLink from "next/link";
import { useImperativeHandle, useRef, type ComponentProps } from "react";
import { useGlobalRouter } from "@/components/global-loading-provider";

/** Keep Next's link semantics/prefetch; own only the actual same-origin navigation. */
export default function GlobalLink({ onNavigate, children, ref, ...props }: ComponentProps<typeof NextLink>) {
  const router = useGlobalRouter();
  const anchor = useRef<HTMLAnchorElement | null>(null);
  useImperativeHandle(ref, () => anchor.current!, []);
  return <NextLink {...props} ref={anchor} onNavigate={(event) => {
    let cancelled = false;
    onNavigate?.({ preventDefault() { cancelled = true; event.preventDefault(); } });
    if (cancelled || !anchor.current) return;
    const next = new URL(anchor.current.href);
    if (next.pathname === location.pathname && next.search === location.search) return;
    event.preventDefault();
    const href = next.pathname + next.search + next.hash;
    const options = { scroll: props.scroll, transitionTypes: props.transitionTypes };
    if (props.replace) router.replace(href, options);
    else router.push(href, options);
  }}>{children}</NextLink>;
}
