import { Banknote, CarFront, CreditCard, Home, LogIn, LogOut, Settings, Users } from "lucide-react";
import type { NavItem } from "@/components/dashboard-shell";
export const operatorNav: NavItem[] = [
  { label: "Painel", href: "/frentista", icon: Home }, { label: "Entradas", href: "/frentista/entradas", icon: LogIn },
  { label: "SaÃ­das", href: "/frentista/saidas", icon: LogOut }, { label: "VeÃ­culos", href: "/frentista/veiculos", icon: CarFront },
  { label: "Caixa", href: "/frentista/caixa", icon: Banknote }, { label: "Mensalistas", href: "/frentista/mensalistas", icon: Users },
  { label: "Pagamentos", href: "/frentista/pagamentos", icon: CreditCard }, { label: "ConfiguraÃ§Ãµes", href: "/frentista/configuracoes", icon: Settings },
];
