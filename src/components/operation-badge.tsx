import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/operator-format";

const tones:Record<StatusTone,string>={blue:"bg-blue-50 text-blue-700",amber:"bg-amber-50 text-amber-800",green:"bg-emerald-50 text-emerald-700",slate:"bg-slate-100 text-slate-700",red:"bg-red-50 text-red-700"};
export function OperationBadge({label,tone}:{label:string;tone:StatusTone}){return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",tones[tone])}>{label}</span>}

