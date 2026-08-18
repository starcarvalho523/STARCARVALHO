import type { ReactNode } from "react";
import { requireCeoScope } from "@/lib/auth";

export default async function TariffsLayout({ children }: { children: ReactNode }) {
  await requireCeoScope("admin");
  return children;
}
