import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GlobalLoadingOverlay } from "@/components/global-loading-overlay";
import { GlobalLoadingProvider } from "@/components/global-loading-provider";
import "./globals.css";
import "./loading-overlay.css";

export const metadata: Metadata = {
  title: "Star Carvalhos Parking",
  description: "Gestão operacional e financeira do estacionamento Star Carvalhos.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="flex min-h-full flex-col antialiased">
        <GlobalLoadingProvider>
          {children}
          <GlobalLoadingOverlay />
        </GlobalLoadingProvider>
      </body>
    </html>
  );
}
