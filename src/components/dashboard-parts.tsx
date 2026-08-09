import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
export function MetricCard({label,value,icon:Icon,tone="blue",note}:{label:string;value:string;icon:LucideIcon;tone?:"blue"|"green"|"violet"|"orange";note?:string}){const tones={blue:"bg-blue-50 text-blue-600",green:"bg-emerald-50 text-emerald-600",violet:"bg-violet-50 text-violet-600",orange:"bg-orange-50 text-orange-600"};return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={cn("grid size-11 place-items-center rounded-2xl",tones[tone])}><Icon className="size-5"/></span><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 text-xl font-bold">{value}</p></div></div>{note&&<p className="mt-3 flex items-center gap-1 text-[11px] font-medium text-emerald-600"><ArrowUpRight className="size-3"/>{note}</p>}</div>}
export function StatusPill({children,tone="green"}:{children:React.ReactNode;tone?:"green"|"amber"|"blue"|"red"}){const tones={green:"bg-emerald-50 text-emerald-700",amber:"bg-amber-50 text-amber-700",blue:"bg-blue-50 text-blue-700",red:"bg-red-50 text-red-700"};return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold",tones[tone])}>{children}</span>}




