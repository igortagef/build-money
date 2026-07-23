import Link from "next/link";
import { Check, Wallet, ArrowLeftRight, Target, PiggyBank, Sparkles, ChevronRight } from "lucide-react";
import { Card, cn } from "./ui";
import type { Onboarding } from "@/lib/onboarding";

type Passo = {
  feito: boolean;
  titulo: string;
  descricao: string;
  href: string;
  cta: string;
  Icon: React.ComponentType<{ className?: string }>;
};

/**
 * Guia de primeiros passos para quem começa. Mostra o que já foi feito e o
 * próximo passo, com atalho direto. Some sozinho quando tudo está completo.
 */
export function PrimeirosPassos({ dados }: { dados: Onboarding }) {
  const passos: Passo[] = [
    {
      feito: dados.temConta,
      titulo: "Cadastre sua primeira conta",
      descricao: "Escolha o banco e informe o saldo de hoje. É daqui que tudo parte.",
      href: "/contas/nova",
      cta: "Criar conta",
      Icon: Wallet,
    },
    {
      feito: dados.temLancamento,
      titulo: "Registre um lançamento",
      descricao: "Uma receita ou despesa — o painel começa a ganhar vida.",
      href: "/lancamentos/novo",
      cta: "Novo lançamento",
      Icon: ArrowLeftRight,
    },
    {
      feito: dados.temOrcamento,
      titulo: "Defina um orçamento",
      descricao: "Um limite por categoria para não passar do combinado.",
      href: "/orcamento",
      cta: "Criar orçamento",
      Icon: PiggyBank,
    },
    {
      feito: dados.temMeta,
      titulo: "Crie uma meta",
      descricao: "Onde você quer chegar: uma reserva, uma viagem, um objetivo.",
      href: "/metas/nova",
      cta: "Definir meta",
      Icon: Target,
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  // O próximo passo pendente ganha destaque.
  const proximoIdx = passos.findIndex((p) => !p.feito);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grad-cash on-accent flex items-center gap-3 p-5">
        <span className="glass grid size-10 shrink-0 place-items-center rounded-xl">
          <Sparkles className="size-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold">Primeiros passos</h2>
          <p className="text-xs opacity-90">
            {feitos} de {passos.length} concluídos · monte seu controle em minutos
          </p>
        </div>
        <div className="tabular text-2xl font-bold">
          {Math.round((feitos / passos.length) * 100)}%
        </div>
      </div>

      <ol className="divide-y divide-border">
        {passos.map((p, i) => {
          const destaque = i === proximoIdx;
          return (
            <li key={p.titulo}>
              <Link
                href={p.href}
                className={cn(
                  "flex items-center gap-3 p-4 transition-colors hover:bg-surface-muted",
                  p.feito && "opacity-70",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    p.feito
                      ? "bg-income-subtle text-income"
                      : destaque
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-muted text-muted-foreground",
                  )}
                >
                  {p.feito ? <Check className="size-4" /> : <p.Icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", p.feito && "line-through")}>{p.titulo}</p>
                  {!p.feito && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                </div>
                {!p.feito && (
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-xs font-semibold",
                      destaque ? "text-primary-text" : "text-muted-foreground",
                    )}
                  >
                    {p.cta}
                    <ChevronRight className="size-3.5" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
