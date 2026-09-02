import Link from "next/link";
import { PaymentReturnStatus } from "@/components/payment-return-status";

const messages={
  cancel:["Pagamento cancelado","Nenhuma nova cobrança foi confirmada. Você pode voltar e escolher outra forma de pagamento."],
  expired:["Link expirado","Este link venceu antes da conclusão. Volte para a mensalidade e gere um novo link; nenhuma cobrança concluída será duplicada."],
} as const;

export default async function Page({searchParams}:{searchParams:Promise<{status?:string;kind?:string;billingPeriodId?:string}>}){
  const params=await searchParams;
  if(params.status==="success"&&params.kind==="monthly"&&params.billingPeriodId){
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><PaymentReturnStatus billingPeriodId={params.billingPeriodId}/></main>;
  }
  const message=messages[params.status as keyof typeof messages]??["Pagamento recebido","A confirmação segura continua automaticamente pelo sistema."] as const;
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm"><p className="text-sm font-bold uppercase tracking-wide text-blue-600">Star Carvalhos</p><h1 className="mt-3 text-3xl font-bold">{message[0]}</h1><p className="mt-3 text-slate-600">{message[1]}</p><Link href="/cliente/mensalidade" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Voltar para minha mensalidade</Link></section></main>;
}
