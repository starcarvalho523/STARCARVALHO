import { Bell, Building2, CircleHelp, FileText, Handshake, Home, Settings, Tags, Users, WalletCards } from "lucide-react";
import type { NavItem } from "@/components/dashboard-shell";

export const ceoNav: NavItem[] = [
  {label:"Painel do CEO",href:"/ceo",icon:Home},
  {label:"Unidades",href:"/ceo/unidades",icon:Building2},
  {label:"Financeiro",href:"/ceo/financeiro",icon:WalletCards},
  {label:"Tarifas",href:"/ceo/tarifas",icon:Tags},
  {label:"Relatórios",href:"/ceo/relatorios",icon:FileText},
  {label:"Convênios",href:"/ceo/convenios",icon:Handshake},
  {label:"Clientes",href:"/ceo/clientes",icon:Users},
  {label:"Equipe",href:"/ceo/equipe",icon:Users},
  {label:"Alertas",href:"/ceo/alertas",icon:Bell},
  {label:"Configurações",href:"/ceo/configuracoes",icon:Settings},
  {label:"Ajuda",href:"/ceo/ajuda",icon:CircleHelp},
];
