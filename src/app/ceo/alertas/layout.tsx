import type { ReactNode } from "react";
import { requireCeoScope } from "@/lib/auth";

export default async function AlertsLayout({ children }: { children: ReactNode }) {
  await requireCeoScope("admin");
  return children;
}
