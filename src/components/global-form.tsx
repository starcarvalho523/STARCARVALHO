"use client";

import { useFormStatus } from "react-dom";
import { type ComponentProps } from "react";
import { useGlobalPending, useGlobalRouter } from "@/components/global-loading-provider";

function PendingForm() {
  const { pending } = useFormStatus();
  useGlobalPending(pending);
  return null;
}

/** Server Actions retain native semantics, validation, submitter and React pending state. */
export function GlobalForm({ children, onSubmit, ...props }: ComponentProps<"form">) {
  const router = useGlobalRouter();
  return <form {...props} onSubmit={(event) => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (typeof props.action === "function" || submitter?.hasAttribute("formaction")) return;
    if ((props.method ?? "get").toLowerCase() !== "get" || (props.target && props.target !== "_self")) return;
    const url = new URL(form.action || location.href);
    if (url.origin !== location.origin) return;
    const data = new FormData(form, submitter);
    if (Array.from(data.values()).some((value) => typeof value !== "string")) return;
    event.preventDefault();
    url.search = new URLSearchParams(Array.from(data.entries()) as [string, string][]).toString();
    router.push(url.pathname + url.search + url.hash);
  }}><PendingForm />{children}</form>;
}
