import { Bell, Building2, CircleHelp, FileText, Handshake, Home, Settings, Users, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";
import { AreaSectionPage, type SectionDefinition } from "@/components/area-section-page";
import type { NavItem } from "@/components/dashboard-shell";

const nav: NavItem[] = [{label:"Painel do CEO",href:"/ceo",icon:Home},{label:"Unidades",href:"/ceo/unidades",icon:Building2},{label:"Financeiro",href:"/ceo/financeiro",icon:WalletCards},{label:"Relatórios",href:"/ceo/relatorios",icon:FileText},{label:"Convênios",href:"/ceo/convenios",icon:Handshake},{label:"Clientes",href:"/ceo/clientes",icon:Users},{label:"Alertas",href:"/ceo/alertas",icon:Bell},{label:"Configurações",href:"/ceo/configuracoes",icon:Settings},{label:"Ajuda",href:"/ceo/ajuda",icon:CircleHelp}];
const sections: Record<string, SectionDefinition> = {
  unidades:{title:"Unidades",description:"Compare capacidade, ocupação e desempenho por estacionamento.",icon:Building2,highlights:["Visão consolidada","Capacidade","Desempenho"]},
  financeiro:{title:"Financeiro",description:"Analise receitas, recebimentos e conciliação.",icon:WalletCards,highlights:["Receita","Formas de pagamento","Conciliação"]},
  relatorios:{title:"Relatórios",description:"Gere análises estratégicas do negócio.",icon:FileText,highlights:["Operacional","Financeiro","Exportações"]},
  convenios:{title:"Convênios",description:"Acompanhe empresas, descontos e mensalistas corporativos.",icon:Handshake,highlights:["Empresas","Contratos","Resultados"]},
  clientes:{title:"Gestão de clientes",description:"Visão administrativa da base de clientes, sem entrar no painel pessoal deles.",icon:Users,highlights:["Cadastros","Segmentos","Relacionamento"]},
  alertas:{title:"Alertas",description:"Centralize ocorrências que exigem atenção da gestão.",icon:Bell,highlights:["Operacionais","Financeiros","Prioridades"]},
  configuracoes:{title:"Configurações administrativas",description:"Gerencie parâmetros estratégicos do sistema.",icon:Settings,highlights:["Regras","Tarifas","Permissões"]},
  ajuda:{title:"Ajuda e suporte",description:"Documentação e canais de atendimento da gestão.",icon:CircleHelp,highlights:["Guias","Suporte","Status do sistema"]},
};
export default async function CeoSection({ params }: { params: Promise<{ secao: string }> }) { const { secao } = await params; const section = sections[secao]; if (!section) notFound(); return <AreaSectionPage role="CEO" active={section.title === "Gestão de clientes" ? "Clientes" : section.title === "Configurações administrativas" ? "Configurações" : section.title === "Ajuda e suporte" ? "Ajuda" : section.title} nav={nav} section={section} home="/ceo" />; }
