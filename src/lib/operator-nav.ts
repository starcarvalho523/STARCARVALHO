import { Banknote, CarFront, CreditCard, History, Home, LogIn, LogOut, Settings, Users } from "lucide-react";
import type { NavItem } from "@/components/dashboard-shell";
export const operatorNav: NavItem[] = [
  { label: "Painel", href: "/frentista", icon: Home }, { label: "Entradas", href: "/frentista/entradas", icon: LogIn },
  { label: "Saídas", href: "/frentista/saidas", icon: LogOut }, { label: "Veículos", href: "/frentista/veiculos", icon: CarFront },
  { label: "Histórico", href: "/frentista/historico", icon: History },
  { label: "Caixa", href: "/frentista/caixa", icon: Banknote }, { label: "Mensalistas", href: "/frentista/mensalistas", icon: Users },
  { label: "Pagamentos", href: "/frentista/pagamentos", icon: CreditCard }, { label: "Configurações", href: "/frentista/configuracoes", icon: Settings },
];

