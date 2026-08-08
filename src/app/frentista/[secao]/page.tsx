import { CarFront, CreditCard, LogIn, LogOut, Settings, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { AreaSectionPage, type SectionDefinition } from "@/components/area-section-page";
import type { NavItem } from "@/components/dashboard-shell";

const nav: NavItem[] = [{label:"Painel",href:"/frentista",icon:CarFront},{label:"Entradas",href:"/frentista/entradas",icon:LogIn},{label:"Saídas",href:"/frentista/saidas",icon:LogOut},{label:"Veículos",href:"/frentista/veiculos",icon:CarFront},{label:"Mensalistas",href:"/frentista/mensalistas",icon:Users},{label:"Pagamentos",href:"/frentista/pagamentos",icon:CreditCard},{label:"Configurações",href:"/frentista/configuracoes",icon:Settings}];
const sections: Record<string, SectionDefinition> = {
  entradas:{title:"Entradas",description:"Registre e acompanhe a chegada dos veículos.",icon:LogIn,highlights:["Nova entrada","Entradas recentes","Validação de placa"]},
  saidas:{title:"Saídas",description:"Finalize estadias e libere veículos com segurança.",icon:LogOut,highlights:["Localizar veículo","Calcular permanência","Liberar saída"]},
  veiculos:{title:"Veículos no pátio",description:"Consulte todos os veículos ativos na unidade.",icon:CarFront,highlights:["Busca por placa","Tempo no pátio","Situação atual"]},
  mensalistas:{title:"Mensalistas",description:"Consulte clientes com planos recorrentes.",icon:Users,highlights:["Planos ativos","Vencimentos","Acesso autorizado"]},
  pagamentos:{title:"Pagamentos",description:"Acompanhe recebimentos do turno e pendências.",icon:CreditCard,highlights:["PIX","Cartão e dinheiro","Pendências"]},
  configuracoes:{title:"Configurações do turno",description:"Ajustes operacionais disponíveis ao frentista.",icon:Settings,highlights:["Unidade atual","Preferências","Suporte"]},
};
export default async function FrentistaSection({ params }: { params: Promise<{ secao: string }> }) { const { secao } = await params; const section = sections[secao]; if (!section) notFound(); return <AreaSectionPage role="Frentista" active={section.title === "Veículos no pátio" ? "Veículos" : section.title} nav={nav} section={section} home="/frentista" />; }
