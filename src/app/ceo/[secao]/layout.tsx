import type { ReactNode } from "react";
import { requireCeoScope } from "@/lib/auth";

export default async function SectionLayout({ children, params }: { children: ReactNode; params: Promise<{ secao: string }> }) {
  const { secao } = await params;
  await requireCeoScope(secao === "ajuda" ? "any" : "admin");
  return children;
}
