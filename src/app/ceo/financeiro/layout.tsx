import type { ReactNode } from "react";
import { requireCeoScope } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireCeoScope("finance");
  return children;
}
