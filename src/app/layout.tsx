import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * Plus Jakarta Sans: humanista, altura-x generosa e ótima legibilidade em
 * corpo longo — troca a Josefin Sans (geométrica, cansativa na leitura) tanto
 * no texto quanto nos títulos. latin-ext traz os acentos do português.
 */
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Valores monetários usam dígitos de largura fixa, para alinhar colunas.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Build Money",
  description: "Gestão de finanças pessoais",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
      // next-themes injeta a classe do tema antes da hidratação, o que o
      // React acusaria como divergência sem este atributo.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
