import type { ReactNode } from "react";
import { requireCeoScope } from "@/lib/auth";

export default async function AuditLayout({ children }: { children: ReactNode }) {
  await requireCeoScope("audit");
  return children;
}
