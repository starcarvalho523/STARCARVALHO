import { Bell, Building2, CircleHelp, FileText, Handshake, Home, MonitorSmartphone, Settings, Tags, Users, WalletCards } from "lucide-react";
import type { NavItem } from "@/components/dashboard-shell";

export const ceoNav: NavItem[] = [
  {label:"Painel do CEO",href:"/ceo",icon:Home,group:"VisÃ£o"},
  {label:"Unidades",href:"/ceo/unidades",icon:Building2,group:"GestÃ£o"},
  {label:"Financeiro",href:"/ceo/financeiro",icon:WalletCards},
  {label:"Terminais",href:"/ceo/terminais",icon:MonitorSmartphone},
  {label:"Tarifas",href:"/ceo/tarifas",icon:Tags},
  {label:"RelatÃ³rios",href:"/ceo/relatorios",icon:FileText},
  {label:"ConvÃªnios",href:"/ceo/convenios",icon:Handshake,group:"Relacionamento"},
  {label:"Clientes",href:"/ceo/clientes",icon:Users},
  {label:"Equipe",href:"/ceo/equipe",icon:Users,group:"AdministraÃ§Ã£o"},
  {label:"Alertas",href:"/ceo/alertas",icon:Bell},
  {label:"ConfiguraÃ§Ãµes",href:"/ceo/configuracoes",icon:Settings},
  {label:"Ajuda",href:"/ceo/ajuda",icon:CircleHelp,group:"Suporte"},
];


