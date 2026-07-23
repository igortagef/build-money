import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { BetaBadge } from "@/components/beta-badge";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Páginas legais (termos, privacidade). Públicas — dá para ler antes de criar
 * conta. Herdam fontes e tema do layout raiz.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <Link href="/" className="inline-flex items-center gap-2" aria-label="Ir para o início">
          <Logo size="sm" />
          <BetaBadge />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 lg:py-12">
        <Link
          href="/entrar"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Link>
        {children}
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border p-4 text-xs text-muted-foreground">
        <Link href="/termos" className="hover:text-foreground hover:underline">
          Termos de uso
        </Link>
        <Link href="/privacidade" className="hover:text-foreground hover:underline">
          Política de privacidade
        </Link>
      </footer>
    </div>
  );
}
