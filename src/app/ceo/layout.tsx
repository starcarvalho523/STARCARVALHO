import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function CeoLayout({ children }: { children: ReactNode }) { await requireArea("ceo"); return children; }
