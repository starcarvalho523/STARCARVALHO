import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CustomerShell } from "@/components/customer-shell";
import { CustomerBillingDocumentForm } from "@/components/customer-billing-document-form";
import { getCustomerData } from "@/lib/customer-data";
import { formatDateTime } from "@/lib/operator-format";

export const dynamic="force-dynamic";

export default async function Page(){
  const data=await getCustomerData();
  return <CustomerShell name={data.profile.full_name} active="Minha conta" unreadNotifications={data.unreadNotifications}>
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Minha conta</h1>
        <p className="mt-1 text-sm text-slate-500">Seus dados pessoais, cobrança e acessos de segurança.</p>
      </div>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Item label="Nome" value={data.profile.full_name}/>
          <Item label="E-mail" value={data.email}/>
          <Item label="Cliente desde" value={formatDateTime(data.profile.created_at)}/>
          <Item label="Identificação de cobrança" value={maskDocument(data.profile.billing_document)}/>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3 border-t pt-5">
          <Link href="/esqueci-senha" className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">Alterar senha</Link>
        </div>
      </section>
      <CustomerBillingDocumentForm current={data.profile.billing_document}/>
      <p className="flex gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <ShieldCheck className="size-5 shrink-0"/>
        O CPF/CNPJ fica protegido pelo acesso da sua conta. O identificador criado no Asaas é armazenado em área privada do sistema e não fica exposto no painel.
      </p>
    </div>
  </CustomerShell>;
}

function maskDocument(value:string|null){
  if(!value)return"Não informado";
  const digits=value.replace(/\D/g,"");
  if(digits.length===11)return`***.***.${digits.slice(6,9)}-${digits.slice(9)}`;
  if(digits.length===14)return`**.***.***/****-${digits.slice(12)}`;
  return"Cadastrado";
}
function Item({label,value}:{label:string;value:string}){return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>}
