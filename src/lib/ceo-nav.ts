import { Bell, Building2, CircleHelp, FileSearch, FileText, Handshake, Home, MonitorSmartphone, Settings, Tags, UserRoundCheck, Users, WalletCards } from "lucide-react";
import type { NavItem } from "@/components/dashboard-shell";

const adminRoles = ["owner", "manager"];

export const ceoNav: NavItem[] = [
  {label:"Painel do CEO",href:"/ceo",icon:Home,group:"Visão",allowedRoles:adminRoles},
  {label:"Unidades",href:"/ceo/unidades",icon:Building2,group:"Gestão",allowedRoles:adminRoles},
  {label:"Financeiro",href:"/ceo/financeiro",icon:WalletCards,allowedRoles:["owner","finance"]},
  {label:"Terminais",href:"/ceo/terminais",icon:MonitorSmartphone,allowedRoles:adminRoles},
  {label:"Tarifas",href:"/ceo/tarifas",icon:Tags,allowedRoles:adminRoles},
  {label:"Relatórios",href:"/ceo/relatorios",icon:FileText,allowedRoles:adminRoles},
  {label:"Convênios",href:"/ceo/convenios",icon:Handshake,group:"Relacionamento",allowedRoles:adminRoles},
  {label:"Mensalistas",href:"/ceo/mensalistas",icon:UserRoundCheck,allowedRoles:adminRoles},
  {label:"Clientes",href:"/ceo/clientes",icon:Users,allowedRoles:adminRoles},
  {label:"Equipe",href:"/ceo/equipe",icon:Users,group:"Administração",allowedRoles:adminRoles},
  {label:"Auditoria",href:"/ceo/auditoria",icon:FileSearch,allowedRoles:["owner","auditor"]},
  {label:"Alertas",href:"/ceo/alertas",icon:Bell,allowedRoles:adminRoles},
  {label:"Configurações",href:"/ceo/configuracoes",icon:Settings,allowedRoles:adminRoles},
  {label:"Ajuda",href:"/ceo/ajuda",icon:CircleHelp,group:"Suporte",allowedRoles:["owner","manager","finance","auditor"]},
];
