import type { Metadata } from "next";
import "@fontsource/silkscreen/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledger North — Albion Americas",
  description: "Kills, builds e histórico de PvP para Albion Online Americas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
