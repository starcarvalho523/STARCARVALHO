import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Star Cavalos Parking",
  description: "Gest\u00e3o operacional e financeira do estacionamento Star Cavalos.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR" className="h-full"><body className="flex min-h-full flex-col antialiased">{children}</body></html>;
}


