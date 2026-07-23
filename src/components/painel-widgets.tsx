"use client";

import Link from "next/link";

import {
  Landmark,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  Flame,
  Target,

  Trophy,
} from "lucide-react";
import { AnimatedNumber, Confetti } from "@/components/anim";
import { CardPainel, Grade } from "@/components/card-painel";
import { formatMoney } from "@/lib/money";
import { cn } from "@/components/ui";
import type { CurrencyCode } from "@/db/schema";

/* ===========================================================================
 * Cartões de destaque (hero) — o topo do painel, com gradientes vibrantes e
 * números que sobem de zero. Inspirado no MODELO: cartões limpos, ícone no
 * canto, rótulo pequeno e o valor em evidência.
 * ========================================================================= */

export function PainelHero({
  patrimonioLiquido,
  saldoContas,
  qtdContas,
  resultadoMes,
  receitaMes,
  despesaMes,
  investimentos,
  rendimentoPct,
  qtdInvestimentos,
  variacaoPatrimonio,
  periodo,
  currency,
  visiveis,
}: {
  patrimonioLiquido: number;
  saldoContas: number;
  qtdContas: number;
  resultadoMes: number;
  receitaMes: number;
  despesaMes: number;
  investimentos: number;
  rendimentoPct: number;
  qtdInvestimentos: number;
  // Variação do patrimônio contra o fim do mês anterior (comparativo pedido).
  variacaoPatrimonio?: { variacao: number; percentual: number | null };
  // Período exibido (de/ate), repassado aos filtros dos lançamentos.
  periodo: { de: string; ate: string };
  currency: CurrencyCode;
  // Ids dos KPIs a mostrar (o usuário escolhe no editor do painel).
  visiveis: string[];
}) {
  const positivo = resultadoMes >= 0;
  const ver = new Set(visiveis);

  // Cada KPI leva aos lançamentos do MESMO período, já filtrado pelo que ele
  // resume. Patrimônio e investimentos fogem à regra: o que os compõe são bens
  // e aplicações, não lançamentos — então apontam para a tela de patrimônio.
  const lanc = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(periodo);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/lancamentos?${p.toString()}`;
  };

  // O card de patrimônio carrega o comparativo com o mês anterior no lugar da
  // descrição fixa — é a informação que responde "estou evoluindo?".
  const v = variacaoPatrimonio;
  const hintPatrimonio =
    v && v.variacao !== 0
      ? `${v.variacao > 0 ? "▲" : "▼"} ${formatMoney(Math.abs(v.variacao), currency)}${
          v.percentual !== null ? ` (${Math.abs(v.percentual)}%)` : ""
        } vs. mês anterior`
      : "Contas + investimentos + bens";

  // Cada card sabe se desenhar dado um atraso de animação; o stagger vem do
  // índice na lista JÁ filtrada (nada de contador mutável no render).
  const defs: Array<{ id: string; node: (stagger: number) => React.ReactNode }> = [
    {
      id: "kpi-receitas",
      node: (st) => (
        <HeroCard tom="income" Icon={ArrowDownLeft} label="Receitas do mês"
          value={receitaMes} currency={currency} hint="Tudo que entrou no período" stagger={st} href={lanc({ tipo: "income" })} />
      ),
    },
    {
      id: "kpi-despesas",
      node: (st) => (
        <HeroCard tom="expense" Icon={ArrowUpRight} label="Despesas do mês"
          value={despesaMes} currency={currency} hint="Tudo que saiu no período" stagger={st} href={lanc({ tipo: "expense" })} />
      ),
    },
    {
      id: "kpi-patrimonio",
      node: (st) => (
        <HeroCard tom="income" Icon={Landmark} label="Patrimônio líquido"
          value={patrimonioLiquido} currency={currency} hint={hintPatrimonio} stagger={st} href="/patrimonio" />
      ),
    },
    {
      id: "kpi-saldo",
      node: (st) => (
        <HeroCard tom="neutro" Icon={Wallet} label="Saldo em contas"
          value={saldoContas} currency={currency} hint={`${qtdContas} ${qtdContas === 1 ? "conta" : "contas"}`} stagger={st} href={lanc()} />
      ),
    },
    {
      id: "kpi-resultado",
      node: (st) => (
        <HeroCard tom={positivo ? "ouro" : "expense"} Icon={positivo ? TrendingUp : TrendingDown}
          label="Resultado do mês" value={resultadoMes} currency={currency}
          hint={`${formatMoney(receitaMes, currency)} entraram · ${formatMoney(despesaMes, currency)} saíram`} stagger={st} href={lanc()} />
      ),
    },
    {
      id: "kpi-investimentos",
      node: (st) => (
        <HeroCard tom="neutro" Icon={PiggyBank} label="Investimentos"
          value={investimentos} currency={currency}
          hint={qtdInvestimentos > 0 ? `${rendimentoPct >= 0 ? "+" : ""}${rendimentoPct}% de rendimento` : "Nada investido ainda"}
          stagger={st} href="/patrimonio" />
      ),
    },
  ];

  const visiveisDefs = defs.filter((d) => ver.has(d.id));
  if (visiveisDefs.length === 0) return null;

  // A grade acompanha quantos KPIs estão visíveis: esconder um faz os outros
  // esticarem e fecharem a linha, sem buraco.
  return (
    <Grade max={3}>
      {visiveisDefs.map((d, idx) => (
        <div key={d.id} className="h-full">
          {d.node(idx * 80)}
        </div>
      ))}
    </Grade>
  );
}

/**
 * KPI no estilo da maquete C: faixa de título teal (centralizada) e, no corpo, o
 * número grande centralizado com uma linha de contexto. A cor migrou do fundo do
 * card para o PRÓPRIO número — é o que deixa o painel calmo sem perder o sinal.
 */
function HeroCard({
  tom,
  Icon,
  label,
  value,
  currency,
  hint,
  stagger,
  href,
}: {
  tom: "neutro" | "income" | "expense" | "ouro";
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  currency: CurrencyCode;
  hint: string;
  stagger: number;
  // Destino do clique: leva aos lançamentos já filtrados por este KPI.
  href: string;
}) {
  const cor =
    tom === "income"
      ? "text-income"
      : tom === "expense"
        ? "text-expense"
        : tom === "ouro"
          ? "text-xp-text"
          : "text-foreground";

  return (
    <Link
      href={href}
      title={`Ver ${label.toLowerCase()} nos lançamentos`}
      className="rise-in flex h-full flex-col overflow-hidden rounded-card bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ ["--stagger" as string]: `${stagger}ms` }}
    >
      <h3 className="card-titulo flex items-center justify-center gap-2 px-3 py-2.5 text-[13px] font-bold">
        <Icon className="size-4 shrink-0" />
        {label}
      </h3>
      <div className="grid flex-1 place-items-center px-3 py-5 text-center">
        <AnimatedNumber
          value={value}
          currency={currency}
          className={cn("tabular block text-[26px] font-bold leading-none", cor)}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </Link>
  );
}

/* ===========================================================================
 * Sequência diária (streak) — recompensa quem abre o app todo dia. Chama que
 * pulsa, brilho que percorre o card. A meta é dar aquele "não quero perder a
 * sequência".
 * ========================================================================= */

export function StreakCard({
  streak,
  recorde,
}: {
  streak: number;
  recorde: number;
}) {
  const bateuRecorde = streak > 0 && streak >= recorde;
  const frase =
    streak === 0
      ? "Comece sua sequência hoje!"
      : bateuRecorde
        ? "Seu melhor momento — não pare!"
        : `Seu recorde é ${recorde} ${recorde === 1 ? "dia" : "dias"}`;

  return (
    <div className="grad-streak on-accent shimmer relative overflow-hidden rounded-card p-5 shadow-sm">
      <div className="relative flex items-center gap-4">
        <span className="glass grid size-14 shrink-0 place-items-center rounded-2xl">
          <Flame className={cn("size-7", streak > 0 && "pulse-soft")} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold opacity-90">Sequência diária</p>
          <p className="tabular text-3xl font-bold leading-tight">
            <AnimatedNumber value={streak} plain duration={900} />
            <span className="ml-1 text-lg font-semibold">
              {streak === 1 ? "dia" : "dias"}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] opacity-85">{frase}</p>
        </div>
      </div>
    </div>
  );
}


/* ===========================================================================
 * Metas com celebração — barras que preenchem ao aparecer e chuva de confete
 * quando alguma meta é atingida. Dá o "eu consegui".
 * ========================================================================= */

type MetaProgresso = {
  id: string;
  name: string;
  percentual: number;
  atingida: boolean;
  guardado: number;
  targetAmount: number;
};

export function MetasCelebracao({
  metas,
  currency,
}: {
  metas: MetaProgresso[];
  currency: CurrencyCode;
}) {
  const algumaAtingida = metas.some((m) => m.atingida);

  return (
    <CardPainel
      titulo="Metas"
      Icon={algumaAtingida ? Trophy : Target}
      acao={{ label: "Ver metas", href: "/metas" }}
      corpoClassName="relative p-5"
    >
      {algumaAtingida && <Confetti />}

      {metas.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Nenhuma meta ativa. Defina onde quer chegar.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {metas.slice(0, 3).map((m, i) => (
            <div key={m.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  {m.atingida && <Trophy className="size-3.5 shrink-0 text-xp-text" aria-hidden />}
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="tabular shrink-0 text-xs font-semibold">
                  {m.percentual}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={cn("fill-bar h-full rounded-full", m.atingida ? "grad-goal" : "bg-primary")}
                  style={{
                    width: `${m.percentual}%`,
                    ["--stagger" as string]: `${200 + i * 120}ms`,
                  }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatMoney(m.guardado, currency)} de {formatMoney(m.targetAmount, currency)}
              </p>
            </div>
          ))}
          {metas.length > 3 && (
            <p className="text-[11px] text-muted-foreground">
              +{metas.length - 3} outras metas
            </p>
          )}
        </div>
      )}
    </CardPainel>
  );
}
