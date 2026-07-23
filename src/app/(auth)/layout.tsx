import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import { BetaBadge } from "@/components/beta-badge";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/*
        Painel da marca, espelhando a tela de splash da identidade: fundo
        teal, símbolo dourado, nome em branco. Só aparece em telas largas —
        no celular ele roubaria o espaço do formulário.
      */}
      <aside className="hidden w-[42%] max-w-lg flex-col justify-center gap-10 bg-brand-teal p-12 lg:flex">
        <div className="space-y-5">
          <LogoMark variant="bare" className="size-16" />
          <p className="flex items-center gap-2 text-xl font-semibold lowercase tracking-tight text-white">
            build money
            <BetaBadge />
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-3xl font-semibold leading-tight text-white">
            Gestão financeira,
            <br />
            construída bloco a bloco.
          </p>
          <p className="max-w-sm leading-relaxed text-white/70">
            Cada lançamento é um tijolo. O dinheiro é a estrutura que une
            todos eles.
          </p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 lg:justify-end">
          <span className="lg:hidden">
            <Logo size="sm" />
          </span>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-4 text-xs text-muted-foreground">
          <span>Versão beta (testes)</span>
          <Link href="/termos" className="hover:text-foreground hover:underline">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="hover:text-foreground hover:underline">
            Política de privacidade
          </Link>
        </footer>
      </div>
    </div>
  );
}
