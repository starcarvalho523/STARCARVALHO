import Link from "next/link";
import { ArrowLeft, CarFront, CircleHelp, Clock3, FileText, History, LockKeyhole, ParkingSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { logout } from "@/app/login/actions";

const sections = {
  historico: { title: "Histórico de estadias", text: "Consulte entradas, saídas e valores das suas visitas anteriores.", icon: History, items: ["Hoje · ABC1D23 · Em andamento", "05 ago · ABC1D23 · R$ 18,00", "29 jul · ABC1D23 · R$ 12,00"] },
  recibos: { title: "Recibos", text: "Acesse comprovantes dos pagamentos vinculados à sua conta.", icon: FileText, items: ["05 ago · PIX · R$ 18,00", "29 jul · Cartão · R$ 12,00", "21 jul · PIX · R$ 24,00"] },
  saida: { title: "Como funciona a saída", text: "Veja as etapas para liberar seu veículo sem complicação.", icon: CarFront, items: ["Confirme o valor da estadia", "Realize o pagamento", "Aguarde a liberação e dirija-se à saída"] },
  ajuda: { title: "Ajuda", text: "Encontre respostas e orientação para sua estadia.", icon: CircleHelp, items: ["Problemas com o PIX", "Pagamento não identificado", "Falar com o estacionamento"] },
} as const;

export default async function ClientSection({ params }: { params: Promise<{ secao: string }> }) {
  const { secao } = await params; const section = sections[secao as keyof typeof sections]; if (!section) notFound(); const Icon = section.icon;
  return <main className="min-h-screen bg-slate-100 px-3 py-5"><div className="mx-auto max-w-[620px] overflow-hidden rounded-[28px] border bg-white shadow-2xl"><header className="flex h-20 items-center justify-between border-b px-5"><Link href="/cliente" className="flex items-center gap-3 font-bold"><span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white"><ParkingSquare className="size-5" /></span>Star Cavalos</Link><form action={logout}><button className="rounded-xl border px-3 py-2 text-xs font-semibold">Sair</button></form></header><div className="space-y-5 p-5"><Link href="/cliente" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft className="size-4" />Painel do cliente</Link><section className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white"><Icon className="size-8" /><h1 className="mt-5 text-2xl font-bold">{section.title}</h1><p className="mt-2 text-sm leading-6 text-blue-100">{section.text}</p></section><div className="space-y-3">{section.items.map((item, index) => <article key={item} className="flex items-center gap-4 rounded-2xl border p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">{index + 1}</span><div className="flex-1"><p className="text-sm font-semibold">{item}</p><p className="mt-1 text-xs text-slate-500">Informação demonstrativa</p></div><Clock3 className="size-4 text-slate-400" /></article>)}</div><p className="flex items-center justify-center gap-2 py-3 text-[11px] text-slate-400"><LockKeyhole className="size-3" />Área exclusiva do cliente autenticado.</p></div></div></main>;
}
