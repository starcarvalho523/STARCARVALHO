import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function FrentistaLayout({ children }: { children: ReactNode }) { await requireArea("frentista"); return children; }
