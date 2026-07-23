import Link from "next/link";
import { AlertTriangle, ChevronDown, Wallet } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getOrcamentoDoMes, NIVEL_ALERTA } from "@/lib/budgets";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { BudgetRow } from "./budget-row";

export const metadata = { title: "Orçamento · Build Money" };

const MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export default async function OrcamentoPage(props: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await props.searchParams;
  const { ledgerId, baseCurrency } = await requireAccess();

  const referencia = mes ? new Date(`${mes}-01T12:00:00`) : new Date();
  const o = await getOrcamentoDoMes(ledgerId, referencia);

  const rotulo = MES.format(referencia);
  const titulo = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);

  const anterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  const proximo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Defina um limite por categoria e acompanhe o quanto já foi.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/orcamento?mes=${iso(anterior)}`}
          className={buttonClasses("secondary", "sm")}
        >
          ‹ Anterior
        </Link>
        <span className="min-w-40 text-center text-sm font-medium">{titulo}</span>
        <Link
          href={`/orcamento?mes=${iso(proximo)}`}
          className={buttonClasses("secondary", "sm")}
        >
          Próximo ›
        </Link>
      </div>

      {/* Resumo do mês */}
      <Card className="p-5">
        {o.totalOrcado === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary-text">
              <Wallet className="size-5" />
            </span>
            <div className="space-y-1">
              <h2 className="font-semibold">Nenhum limite definido</h2>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Escolha abaixo as categorias que você quer controlar e defina
                quanto pretende gastar por mês. O valor se repete nos meses
                seguintes até você mudar.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Gasto do orçamento
                </p>
                <p className="tabular mt-1 text-2xl font-semibold">
                  {formatMoney(o.totalGasto, baseCurrency)}
                  <span className="text-base font-normal text-muted-foreground">
                    {" de "}
                    {formatMoney(o.totalOrcado, baseCurrency)}
                  </span>
                </p>
              </div>
              <p
                className={cn(
                  "tabular text-sm font-semibold",
                  o.totalRestante < 0 ? "text-expense" : "text-income",
                )}
              >
                {o.totalRestante < 0
                  ? `${formatMoney(-o.totalRestante, baseCurrency)} acima`
                  : `${formatMoney(o.totalRestante, baseCurrency)} disponível`}
              </p>
            </div>

            <div
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted"
              role="progressbar"
              aria-valuenow={Math.min(100, o.percentualTotal)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Uso total do orçamento"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  o.totalRestante < 0
                    ? "bg-expense"
                    : o.percentualTotal >= NIVEL_ALERTA
                      ? "bg-warning"
                      : "bg-primary",
                )}
                style={{ width: `${Math.min(100, o.percentualTotal)}%` }}
              />
            </div>

            {/*
              Gasto fora das categorias orçadas. Sem este aviso, alguém que
              orça só duas categorias veria "tudo sob controle" enquanto o
              dinheiro sai por todo o resto.
            */}
            {o.gastoForaDoOrcamento > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Mais{" "}
                  <strong className="tabular text-foreground">
                    {formatMoney(o.gastoForaDoOrcamento, baseCurrency)}
                  </strong>{" "}
                  foram gastos em categorias sem limite definido — esses valores
                  não entram na barra acima.
                </span>
              </p>
            )}
          </>
        )}
      </Card>

      {/* Categorias com limite */}
      {o.comOrcamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Com limite
          </h2>
          <Card className="divide-y divide-border">
            {o.comOrcamento.map((i) => (
              <BudgetRow
                key={i.categoryId}
                item={i}
                mes={o.mes}
                currency={baseCurrency}
              />
            ))}
          </Card>
        </section>
      )}

      {/*
        As demais categorias são 70+; listadas de uma vez viram um paredão que
        ninguém lê. Ficam agrupadas e recolhidas — o usuário abre o grupo que
        quer orçar.
      */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {o.comOrcamento.length > 0 ? "Sem limite" : "Escolha o que controlar"}
        </h2>

        <div className="space-y-2">
          {agruparPorPai(o.semOrcamento).map(([grupo, itens]) => (
            <details key={grupo} className="group">
              <summary className="flex cursor-pointer items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-sm transition-colors hover:border-border-strong">
                <span className="font-medium">{grupo}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {itens.length}{" "}
                  {itens.length === 1 ? "categoria" : "categorias"}
                  <ChevronDown
                    className="size-4 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </span>
              </summary>

              <Card className="mt-1 divide-y divide-border">
                {itens.map((i) => (
                  <BudgetRow
                    key={i.categoryId}
                    item={i}
                    mes={o.mes}
                    currency={baseCurrency}
                  />
                ))}
              </Card>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Agrupa as categorias sem limite pelo grupo a que pertencem, preservando a
 * ordem em que vieram do banco (que já é a ordem do plano de contas).
 */
function agruparPorPai(
  itens: Awaited<ReturnType<typeof getOrcamentoDoMes>>["semOrcamento"],
) {
  const mapa = new Map<string, typeof itens>();

  for (const i of itens) {
    // "Moradia › Aluguel" -> "Moradia"; um grupo sem subcategoria fica nele mesmo.
    const grupo = i.caminho.includes(" › ")
      ? i.caminho.split(" › ")[0]
      : i.nome;
    if (!mapa.has(grupo)) mapa.set(grupo, []);
    mapa.get(grupo)!.push(i);
  }

  return [...mapa.entries()];
}
