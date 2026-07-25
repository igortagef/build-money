import Link from "next/link";
import { Plus, TrendingUp, TrendingDown, Home, Landmark } from "lucide-react";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, goals } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import {
  getAssets,
  getResumoPatrimonio,
  getEvolucaoPatrimonio,
} from "@/lib/assets";
import { getAccountsWithBalance } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { BankIcon } from "@/components/bank-icon";
import { buttonClasses, Card, cn } from "@/components/ui";
import { WealthChart } from "./wealth-chart";
import { ValorAtualEditavel, DeleteAssetButton } from "./update-value";
import { AporteForm } from "./aporte-form";
import { ResgateForm } from "./resgate-form";

export const metadata = { title: "Patrimônio · Build Money" };

export default async function PatrimonioPage(props: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await props.searchParams;
  const { ledgerId, baseCurrency } = await requireAccess();

  const [lista, resumo, evolucao, todasContas, contas, metas] = await Promise.all([
    getAssets(ledgerId),
    getResumoPatrimonio(ledgerId),
    getEvolucaoPatrimonio(ledgerId, 6),
    getAccountsWithBalance(ledgerId),
    // Contas de onde o dinheiro do aporte pode sair (líquidas, não-piscina).
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.ledgerId, ledgerId),
          isNull(accounts.archivedAt),
          eq(accounts.isReimbursementPool, false),
          eq(accounts.isInvestmentPool, false),
          inArray(accounts.type, ["checking", "savings", "cash"]),
        ),
      )
      .orderBy(asc(accounts.name)),
    // Metas ativas, para o vínculo opcional do aporte.
    db
      .select({ id: goals.id, name: goals.name })
      .from(goals)
      .where(and(eq(goals.ledgerId, ledgerId), eq(goals.status, "active")))
      .orderBy(asc(goals.name)),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);
  const investimentos = lista.filter((a) => a.investimento);
  const bens = lista.filter((a) => !a.investimento);
  // Contas do tipo "investimento" (aplicações por conta lançada — ex.: corretora).
  const contasInvest = todasContas.filter((c) => c.type === "investment" && c.includeInNetWorth);
  const totalContasInvest = contasInvest.reduce((s, c) => s + c.balance, 0);

  // Filtro de investimentos por classe.
  const invFiltrados =
    tipo === "fixa"
      ? investimentos.filter((a) => a.kind === "fixed_income")
      : tipo === "variavel"
        ? investimentos.filter((a) => a.kind === "variable_income")
        : investimentos;

  const vazio = lista.length === 0 && contasInvest.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            Seus investimentos e bens, construídos bloco a bloco.
          </p>
        </div>
        <Link href="/patrimonio/novo" className={buttonClasses()}>
          <Plus className="size-4" />
          Adicionar
        </Link>
      </div>

      {vazio ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary-text">
            <Landmark className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-semibold">Comece a construir seu patrimônio</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Cadastre seus investimentos (renda fixa e variável) e seus bens —
              carro, casa, terreno. Acompanhe quanto rende e como cresce mês a
              mês.
            </p>
          </div>
          <Link href="/patrimonio/novo" className={buttonClasses("primary", "lg")}>
            <Plus className="size-4" />
            Adicionar o primeiro
          </Link>
        </Card>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Patrimônio total</p>
              <p className="tabular mt-1 text-2xl font-semibold">
                {formatMoney(resumo.patrimonioTotal, baseCurrency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMoney(resumo.valorInvestimentos, baseCurrency)} investido +{" "}
                {formatMoney(resumo.valorBens, baseCurrency)} em bens
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Investido</p>
              <p className="tabular mt-1 text-2xl font-semibold">
                {formatMoney(resumo.totalInvestido, baseCurrency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">o que você aportou</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Rendimento</p>
              <p
                className={cn(
                  "tabular mt-1 flex items-center gap-1 text-2xl font-semibold",
                  resumo.rendimento >= 0 ? "text-income" : "text-expense",
                )}
              >
                {resumo.rendimento >= 0 ? (
                  <TrendingUp className="size-5" />
                ) : (
                  <TrendingDown className="size-5" />
                )}
                {formatMoney(Math.abs(resumo.rendimento), baseCurrency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {resumo.rendimentoPct >= 0 ? "+" : ""}
                {resumo.rendimentoPct}% sobre o investido
              </p>
            </Card>
          </div>

          <WealthChart dados={evolucao} currency={baseCurrency} />

          {/* Investimentos com filtros e análise de rendimento */}
          {investimentos.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Investimentos
                </h2>
                <div className="flex gap-1">
                  {(
                    [
                      { v: undefined, label: "Todos" },
                      { v: "fixa", label: "Renda fixa" },
                      { v: "variavel", label: "Renda variável" },
                    ] as const
                  ).map(({ v, label }) => (
                    <Link
                      key={label}
                      href={v ? `/patrimonio?tipo=${v}` : "/patrimonio"}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        (tipo ?? undefined) === v
                          ? "bg-primary-subtle text-primary-text"
                          : "text-muted-foreground hover:bg-surface-muted",
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {invFiltrados.map((a) => (
                  <AtivoCard
                    key={a.id}
                    ativo={a}
                    currency={baseCurrency}
                    contas={contas}
                    metas={metas}
                    hoje={hoje}
                  />
                ))}
                {invFiltrados.length === 0 && (
                  <Card className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum investimento nesta classe.
                  </Card>
                )}
              </div>
            </section>
          )}

          {/* Investimentos por conta lançada (contas do tipo investimento) */}
          {contasInvest.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">Investimentos em conta</h2>
                <span className="tabular text-sm font-semibold">{formatMoney(totalContasInvest, baseCurrency)}</span>
              </div>
              <div className="space-y-2">
                {contasInvest.map((c) => (
                  <Card key={c.id} className="flex items-center gap-3 p-4">
                    {c.icon ? (
                      <BankIcon bankId={c.icon} />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text" aria-hidden>
                        <TrendingUp className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Conta de investimento{c.institution ? ` · ${c.institution}` : ""}
                      </p>
                    </div>
                    <span className="tabular font-semibold">{formatMoney(c.balance, c.currency)}</span>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Saldo transferido para contas de investimento. Aparece também no card de
                Investimentos do painel.
              </p>
            </section>
          )}

          {/* Bens */}
          {bens.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Bens</h2>
              <div className="space-y-2">
                {bens.map((a) => (
                  <Card key={a.id} className="flex items-center gap-3 p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text" aria-hidden>
                      <Home className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.kindLabel}
                        {a.detail && ` · ${a.detail}`}
                      </p>
                    </div>
                    <ValorAtualEditavel id={a.id} valor={a.currentValue} currency={a.currency} />
                    <DeleteAssetButton id={a.id} nome={a.name} />
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Cartão de investimento com a análise de rendimento: uma barra em que a
 * parte clara é o aportado e a parte escura (ou vermelha) é o rendimento —
 * o quanto o dinheiro cresceu (ou encolheu) sozinho.
 */
function AtivoCard({
  ativo,
  currency,
  contas,
  metas,
  hoje,
}: {
  ativo: Awaited<ReturnType<typeof getAssets>>[number];
  currency: "BRL" | "USD" | "EUR";
  contas: { id: string; name: string }[];
  metas: { id: string; name: string }[];
  hoje: string;
}) {
  const rend = ativo.rendimento ?? 0;
  const positivo = rend >= 0;
  // Proporção da barra: aportado vs rendimento (quando positivo).
  const base = Math.max(ativo.investedValue, ativo.currentValue, 1);
  const pctAportado = (Math.min(ativo.investedValue, ativo.currentValue) / base) * 100;
  const pctRend = (Math.abs(rend) / base) * 100;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{ativo.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ativo.kindLabel}
            {ativo.detail && ` · ${ativo.detail}`}
          </p>
        </div>
        <div className="text-right">
          <ValorAtualEditavel id={ativo.id} valor={ativo.currentValue} currency={currency} />
          {ativo.rendimentoPct !== null && (
            <p
              className={cn(
                "tabular text-xs font-medium",
                positivo ? "text-income" : "text-expense",
              )}
            >
              {positivo ? "+" : "−"}
              {formatMoney(Math.abs(rend), currency)} ({positivo ? "+" : ""}
              {ativo.rendimentoPct}%)
            </p>
          )}
        </div>
        <DeleteAssetButton id={ativo.id} nome={ativo.name} />
      </div>

      {/* Barra aportado + rendimento */}
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="bg-primary" style={{ width: `${pctAportado}%` }} title="Aportado" />
        <div
          className={positivo ? "bg-income" : "bg-expense"}
          style={{ width: `${pctRend}%` }}
          title={positivo ? "Rendimento" : "Perda"}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Aportado {formatMoney(ativo.investedValue, currency)}</span>
        <span>Hoje {formatMoney(ativo.currentValue, currency)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AporteForm assetId={ativo.id} currency={currency} contas={contas} metas={metas} hoje={hoje} />
        <ResgateForm assetId={ativo.id} currency={currency} contas={contas} hoje={hoje} />
      </div>
    </Card>
  );
}
