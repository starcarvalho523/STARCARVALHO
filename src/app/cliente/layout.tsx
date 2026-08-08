import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function ClienteLayout({ children }: { children: ReactNode }) { await requireArea("cliente"); return children; }
