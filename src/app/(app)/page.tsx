import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  PiggyBank,
  HandCoins,
  Sparkles,
} from "lucide-react";
import { requireAccess } from "@/lib/auth";
import {
  getAccountsWithBalance,
  getExpensesByCategory,
  getExpensesByCostCenter,
  getMonthlyTrend,
  getMonthSummary,
  getVencimentos,
  getResumoRachas,
  monthRange,
} from "@/lib/queries";
import { getResumoPatrimonio } from "@/lib/assets";
import { getMetasComProgresso } from "@/lib/goals";
import { getOrcamentoDoMes } from "@/lib/budgets";
import { getProgresso } from "@/lib/gamification";
import { CategoryRanking, MonthlyTrendChart } from "@/components/charts";
import {
  PainelHero,
  StreakCard,

  MetasCelebracao,
} from "@/components/painel-widgets";
import { MonthPicker } from "@/components/month-picker";
import { getPainelHidden } from "@/lib/dashboard";
import { getOnboarding } from "@/lib/onboarding";
import { PainelPersonalizar } from "./painel-personalizar";
import { PrimeirosPassos } from "@/components/primeiros-passos";
import { CardPainel, Grade } from "@/components/card-painel";
import { AConferirCard, ComparativoCard } from "@/components/painel-extras";
import {
  getComparativoPatrimonio,
  getAConferir,
  getComparativoMensal,
} from "@/lib/painel-extras";
import { formatMoney } from "@/lib/money";
import { cn } from "@/components/ui";
import type { CurrencyCode } from "@/db/schema";
import type { Regime } from "@/lib/statement";
import { REGIME_EXPLICACAO, REGIME_LABEL } from "@/lib/statement";

export const metadata = { title: "Painel · Build Money" };

const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

function formatMonth(date: Date) {
  const label = MONTH_LABEL.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// "YYYY-MM" válido -> primeiro dia do mês; qualquer outra coisa -> mês atual.
function parseMesRef(mes: string | undefined): { referencia: Date; ehAtual: boolean } {
  const hoje = new Date();
  const atualIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, m] = mes.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      return { referencia: new Date(ano, m - 1, 1), ehAtual: mes === atualIso };
    }
  }
  return { referencia: hoje, ehAtual: true };
}

export default async function PainelPage(props: {
  searchParams: Promise<{ regime?: string; mes?: string }>;
}) {
  const { regime: regimeParam, mes: mesParam } = await props.searchParams;
  const regime: Regime = regimeParam === "caixa" ? "caixa" : "competencia";
  const { referencia, ehAtual } = parseMesRef(mesParam);
  const mesIso = `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, "0")}`;

  const { ledgerId, baseCurrency, userName, userId } = await requireAccess();

  const [
    accounts,
    summary,
    tendencia,
    porCategoria,
    porCentro,
    vencimentos,
    patrimonio,
    metas,
    orcamento,
    rachas,
    progresso,
    hidden,
    onboarding,
    compPatrimonio,
    aConferir,
    comparativo,
  ] = await Promise.all([
    getAccountsWithBalance(ledgerId),
    getMonthSummary(ledgerId, referencia, regime),
    getMonthlyTrend(ledgerId, 6, regime, referencia),
    getExpensesByCategory(ledgerId, referencia, 6, regime),
    getExpensesByCostCenter(ledgerId, referencia, regime),
    getVencimentos(ledgerId),
    getResumoPatrimonio(ledgerId),
    getMetasComProgresso(ledgerId),
    getOrcamentoDoMes(ledgerId, referencia, regime),
    getResumoRachas(ledgerId),
    getProgresso(userId),
    getPainelHidden(userId),
    getOnboarding(ledgerId),
    getComparativoPatrimonio(ledgerId, referencia),
    getAConferir(ledgerId),
    getComparativoMensal(ledgerId, referencia),
  ]);

  // Blocos escondidos pelo usuário; `mostra(id)` decide o que renderizar.
  const mostra = (id: string) => !hidden.has(id);

  // Período exibido, usado nos atalhos dos KPIs para os lançamentos.
  const { start: inicioMes, end: fimMes } = monthRange(referencia);

  const saldoContas = accounts
    .filter((a) => a.includeInNetWorth)
    .reduce((sum, a) => sum + a.balance, 0);

  // Patrimônio consolidado = dinheiro nas contas + investimentos + bens.
  const patrimonioLiquido = saldoContas + patrimonio.patrimonioTotal;
  const metasAtivas = metas.filter((m) => m.status === "active");
  const firstName = userName?.split(" ")[0];

  const semDados = accounts.length === 0 && patrimonio.patrimonioTotal === 0;

  const resumoDoDia = montarResumoDoDia({
    resultadoMes: summary.balance,
    aVencer: vencimentos.totalAVencer,
    qtdAVencer: vencimentos.aVencer.length,
    orcamentoPct: orcamento.totalOrcado > 0 ? orcamento.percentualTotal : null,
    metaTopo: metasAtivas[0] ?? null,
    streak: progresso.currentStreak,
    currency: baseCurrency,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Olá, ${firstName}` : "Painel"}
          </h1>
          <p className="text-sm text-muted-foreground">{formatMonth(referencia)}</p>
        </div>
        {!semDados && (
          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker mes={mesIso} regime={regime} ehAtual={ehAtual} />
            <RegimeToggle atual={regime} mes={ehAtual ? undefined : mesIso} />
            <PainelPersonalizar hidden={[...hidden]} />
          </div>
        )}
      </div>

      {/* Guia de primeiros passos: guia quem começa e some quando tudo é feito. */}
      {!onboarding.tudoFeito && <PrimeirosPassos dados={onboarding} />}

      {semDados ? null : (
        <>
          {/* 1 — Resultado: receitas, despesas e o saldo do mês, na mesma linha */}
          <PainelHero
            patrimonioLiquido={patrimonioLiquido}
            saldoContas={saldoContas}
            qtdContas={accounts.filter((a) => a.includeInNetWorth).length}
            resultadoMes={summary.balance}
            receitaMes={summary.income}
            despesaMes={summary.expense}
            investimentos={patrimonio.valorInvestimentos}
            rendimentoPct={patrimonio.rendimentoPct}
            qtdInvestimentos={patrimonio.qtdInvestimentos}
            periodo={{ de: inicioMes, ate: fimMes }}
            currency={baseCurrency}
            visiveis={["kpi-receitas", "kpi-despesas", "kpi-resultado"].filter(mostra)}
          />

          {/* 2 — Patrimônio (com o comparativo contra o mês anterior) */}
          <PainelHero
            patrimonioLiquido={patrimonioLiquido}
            saldoContas={saldoContas}
            qtdContas={accounts.filter((a) => a.includeInNetWorth).length}
            resultadoMes={summary.balance}
            receitaMes={summary.income}
            despesaMes={summary.expense}
            investimentos={patrimonio.valorInvestimentos}
            rendimentoPct={patrimonio.rendimentoPct}
            qtdInvestimentos={patrimonio.qtdInvestimentos}
            variacaoPatrimonio={compPatrimonio}
            periodo={{ de: inicioMes, ate: fimMes }}
            currency={baseCurrency}
            visiveis={["kpi-patrimonio", "kpi-saldo", "kpi-investimentos"].filter(mostra)}
          />

          {/* 3 — Engajamento, na mesma linha */}
          <Grade max={2}>
            {mostra("resumo-dia") && <ResumoDoDia texto={resumoDoDia} />}
            {mostra("streak") && (
              <StreakCard streak={progresso.currentStreak} recorde={progresso.longestStreak} />
            )}
          </Grade>

          {/* 4 — Do mês: uma linha inteira para cada */}
          {mostra("vencimentos") && <Vencimentos dados={vencimentos} currency={baseCurrency} />}
          {mostra("evolucao") && <MonthlyTrendChart dados={tendencia} currency={baseCurrency} />}

          {/* 5 — Resumos, na mesma linha */}
          <Grade max={3}>
            {mostra("orcamento") && <OrcamentoResumo dados={orcamento} currency={baseCurrency} />}
            {mostra("metas") && <MetasCelebracao metas={metasAtivas} currency={baseCurrency} />}
            {mostra("rachas") && <RachasResumo dados={rachas} currency={baseCurrency} />}
          </Grade>

          {/* 6 — Para onde o dinheiro foi */}
          <Grade max={2}>
            {mostra("despesas-categoria") && (
              <CategoryRanking
                titulo="Despesas por categoria"
                dados={porCategoria}
                currency={baseCurrency}
                vazio="Nenhuma despesa neste mês."
              />
            )}
            {mostra("despesas-centro") && (
              <CategoryRanking
                titulo="Por centro de custo"
                dados={porCentro}
                currency={baseCurrency}
                vazio="Nenhuma despesa neste mês."
              />
            )}
          </Grade>

          {/* 7 — Acompanhamento (novos) */}
          <Grade max={2}>
            {mostra("a-conferir") && <AConferirCard dados={aConferir} currency={baseCurrency} />}
            {mostra("comparativo") && <ComparativoCard dados={comparativo} currency={baseCurrency} />}
          </Grade>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Resumo do dia — uma frase de destaque que muda diariamente, escolhida entre
 * os fatos mais relevantes do momento. Determinístico pela data (nada de
 * Math.random no servidor), então servidor e cliente concordam.
 * ------------------------------------------------------------------------- */

function montarResumoDoDia(d: {
  resultadoMes: number;
  aVencer: number;
  qtdAVencer: number;
  orcamentoPct: number | null;
  metaTopo: { name: string; percentual: number } | null;
  streak: number;
  currency: CurrencyCode;
}): string {
  const opcoes: string[] = [];

  if (d.resultadoMes >= 0) {
    opcoes.push(`Seu mês está positivo em ${formatMoney(d.resultadoMes, d.currency)} — continue construindo.`);
  } else {
    opcoes.push(`As despesas superaram as receitas em ${formatMoney(-d.resultadoMes, d.currency)} neste mês. Vale revisar os gastos.`);
  }
  if (d.qtdAVencer > 0) {
    opcoes.push(`Você tem ${formatMoney(d.aVencer, d.currency)} a vencer nos próximos dias. Deixe tudo em dia!`);
  }
  if (d.orcamentoPct !== null) {
    opcoes.push(`Você já usou ${d.orcamentoPct}% do orçamento do mês. Fique de olho no ritmo.`);
  }
  if (d.metaTopo) {
    opcoes.push(`Sua meta "${d.metaTopo.name}" está em ${d.metaTopo.percentual}%. Cada aporte te aproxima.`);
  }
  if (d.streak > 1) {
    opcoes.push(`${d.streak} dias seguidos cuidando das suas finanças. Constância é o que constrói riqueza.`);
  }
  opcoes.push("Organizar hoje é ter tranquilidade amanhã. Registre seus lançamentos do dia.");

  // Índice pelo dia do ano, para a mensagem girar diariamente.
  const agora = new Date();
  const inicioAno = new Date(agora.getFullYear(), 0, 0);
  const diaDoAno = Math.floor((agora.getTime() - inicioAno.getTime()) / 86400000);
  return opcoes[diaDoAno % opcoes.length];
}

function ResumoDoDia({ texto }: { texto: string }) {
  return (
    <div className="rise-in flex h-full items-center gap-3 rounded-card border border-primary-border bg-primary-subtle p-5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </span>
      <div>
        <p className="text-xs font-semibold text-primary-text">Resumo do dia</p>
        <p className="mt-0.5 text-sm text-foreground">{texto}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Regime
 * ------------------------------------------------------------------------- */

function RegimeToggle({ atual, mes }: { atual: Regime; mes?: string }) {
  const href = (r: Regime) => {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    if (r === "caixa") params.set("regime", "caixa");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };
  return (
    <div
      className="flex rounded-lg border border-border bg-surface p-0.5"
      role="group"
      aria-label="Regime do relatório"
    >
      {(["competencia", "caixa"] as const).map((r) => (
        <Link
          key={r}
          href={href(r)}
          aria-current={atual === r ? "true" : undefined}
          title={REGIME_EXPLICACAO[r]}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            atual === r
              ? "bg-primary-subtle text-primary-text"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {REGIME_LABEL[r]}
        </Link>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cabeçalho de card-resumo, com link para a seção
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * Resumos por seção
 * ------------------------------------------------------------------------- */


function OrcamentoResumo({
  dados,
  currency,
}: {
  dados: Awaited<ReturnType<typeof getOrcamentoDoMes>>;
  currency: CurrencyCode;
}) {
  const temOrcamento = dados.totalOrcado > 0;
  const pct = Math.min(100, dados.percentualTotal);

  return (
    <CardPainel titulo="Orçamento do mês" Icon={PiggyBank} acao={{ label: "Ver orçamento", href: "/orcamento" }} corpoClassName="space-y-3 p-5">
      {temOrcamento ? (
        <>
          <div className="flex items-baseline justify-between">
            <p className="tabular text-2xl font-semibold">
              {formatMoney(dados.totalGasto, currency)}
            </p>
            <p className="tabular text-sm text-muted-foreground">
              de {formatMoney(dados.totalOrcado, currency)}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn(
                "h-full rounded-full",
                dados.totalRestante < 0
                  ? "bg-expense"
                  : pct >= 80
                    ? "bg-warning"
                    : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {dados.totalRestante < 0
              ? `${formatMoney(-dados.totalRestante, currency)} acima do previsto`
              : `${formatMoney(dados.totalRestante, currency)} disponível`}
            {dados.estourouAlguma && " · alguma categoria estourou"}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Defina limites por categoria para acompanhar aqui.
        </p>
      )}
    </CardPainel>
  );
}

function RachasResumo({
  dados,
  currency,
}: {
  dados: Awaited<ReturnType<typeof getResumoRachas>>;
  currency: CurrencyCode;
}) {
  return (
    <CardPainel titulo="Rachas" Icon={HandCoins} acao={{ label: "Ver rachas", href: "/rachas" }} corpoClassName="space-y-3 p-5">
      {dados.emAberto === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum valor a receber no momento.
        </p>
      ) : (
        <>
          <p className="tabular text-2xl font-semibold text-primary-text">
            {formatMoney(dados.aReceber, currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            a receber em {dados.emAberto} {dados.emAberto === 1 ? "racha" : "rachas"} em aberto
          </p>
        </>
      )}
    </CardPainel>
  );
}

/* ---------------------------------------------------------------------------
 * Vencimentos e estado vazio
 * ------------------------------------------------------------------------- */

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

function Vencimentos({
  dados,
  currency,
}: {
  dados: Awaited<ReturnType<typeof getVencimentos>>;
  currency: CurrencyCode;
}) {
  if (dados.vencidas.length === 0 && dados.aVencer.length === 0) return null;

  /**
   * O atalho abre os lançamentos já filtrados: a situação (vencidas/previstos),
   * a categoria do item e o dia do vencimento — chega direto no que foi clicado.
   */
  const urlDoItem = (l: (typeof dados.vencidas)[number], vencida: boolean) => {
    const p = new URLSearchParams({
      status: vencida ? "vencidas" : "previstos",
      de: l.date,
      ate: l.date,
    });
    if (l.categoryId) p.set("categoria", l.categoryId);
    return `/lancamentos?${p.toString()}`;
  };

  const item = (l: (typeof dados.vencidas)[number], vencida: boolean) => (
    <Link
      key={l.id}
      href={urlDoItem(l, vencida)}
      title={`Ver ${l.description} nos lançamentos`}
      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted"
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md",
          vencida ? "bg-expense-subtle text-expense" : "bg-xp-subtle text-warning",
        )}
        aria-hidden
      >
        {vencida ? <AlertTriangle className="size-3.5" /> : <CalendarClock className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{l.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {DATA_CURTA.format(new Date(`${l.date}T12:00:00`))} · {l.accountName}
        </p>
      </div>
      <span
        className={cn(
          "tabular shrink-0 text-sm font-semibold",
          l.type === "income" ? "text-income" : "text-expense",
        )}
      >
        {l.type === "income" ? "+" : "−"} {formatMoney(l.amount, l.currency)}
      </span>
    </Link>
  );

  return (
    <CardPainel titulo="Vencimentos" Icon={CalendarClock} corpoClassName="space-y-4 p-5">
      {dados.vencidas.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-expense">
              <AlertTriangle className="size-4" aria-hidden />
              Vencidas
            </h2>
            {dados.totalVencido > 0 && (
              <span className="tabular text-sm font-semibold text-expense">
                {formatMoney(dados.totalVencido, currency)}
              </span>
            )}
          </div>
          <div className="-mx-2">{dados.vencidas.map((l) => item(l, true))}</div>
        </div>
      )}
      {dados.aVencer.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-warning">
              <CalendarClock className="size-4" aria-hidden />
              A vencer nos próximos dias
            </h2>
            {dados.totalAVencer > 0 && (
              <span className="tabular text-sm font-semibold text-warning">
                {formatMoney(dados.totalAVencer, currency)}
              </span>
            )}
          </div>
          <div className="-mx-2">{dados.aVencer.map((l) => item(l, false))}</div>
        </div>
      )}
    </CardPainel>
  );
}

