import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { assetKinds, assets, assetSnapshots } from "@/db/schema";
import { ehInvestimento, rotuloTipo } from "./asset-kinds";

// Reexporta as constantes puras para quem já importa daqui; o cliente deve
// importar direto de "./asset-kinds" para não puxar este módulo server-only.
export {
  KINDS_INVESTIMENTO,
  KINDS_BEM,
  KIND_LABEL,
  ehInvestimento,
} from "./asset-kinds";

/**
 * Todos os itens de patrimônio do espaço, com rendimento calculado para os
 * investimentos. O rendimento é `currentValue - investedValue`; bens não têm
 * "aportado", então o rendimento deles fica nulo (não faz sentido).
 */
export async function getAssets(ledgerId: string) {
  const linhas = await db
    .select({
      asset: assets,
      // Nome do tipo de bem editável, quando houver.
      tipoBemNome: assetKinds.name,
    })
    .from(assets)
    .leftJoin(assetKinds, eq(assets.assetKindId, assetKinds.id))
    .where(and(eq(assets.ledgerId, ledgerId), isNull(assets.archivedAt)))
    .orderBy(asc(assets.kind), desc(assets.currentValue));

  return linhas.map(({ asset: a, tipoBemNome }) => {
    const investimento = ehInvestimento(a.kind);
    const rendimento = investimento ? a.currentValue - a.investedValue : null;
    const rendimentoPct =
      investimento && a.investedValue > 0
        ? Math.round(((a.currentValue - a.investedValue) / a.investedValue) * 1000) / 10
        : null;
    // Rótulo do tipo: o nome do tipo de bem editável tem prioridade; senão cai
    // no enum/customKind (bens antigos, investimentos).
    const kindLabel = tipoBemNome ?? rotuloTipo(a.kind, a.customKind);
    return { ...a, investimento, rendimento, rendimentoPct, kindLabel };
  });
}

/** Resumo do patrimônio: total, investimentos, bens, e rendimento acumulado. */
export async function getResumoPatrimonio(ledgerId: string) {
  const lista = await getAssets(ledgerId);

  const investimentos = lista.filter((a) => a.investimento);
  const bens = lista.filter((a) => !a.investimento);

  const totalInvestido = investimentos.reduce((s, a) => s + a.investedValue, 0);
  const valorInvestimentos = investimentos.reduce((s, a) => s + a.currentValue, 0);
  const valorBens = bens.reduce((s, a) => s + a.currentValue, 0);

  const rendaFixa = investimentos
    .filter((a) => a.kind === "fixed_income")
    .reduce((s, a) => s + a.currentValue, 0);
  const rendaVariavel = investimentos
    .filter((a) => a.kind === "variable_income")
    .reduce((s, a) => s + a.currentValue, 0);

  return {
    totalInvestido,
    valorInvestimentos,
    valorBens,
    patrimonioTotal: valorInvestimentos + valorBens,
    rendimento: valorInvestimentos - totalInvestido,
    rendimentoPct:
      totalInvestido > 0
        ? Math.round(((valorInvestimentos - totalInvestido) / totalInvestido) * 1000) / 10
        : 0,
    rendaFixa,
    rendaVariavel,
    qtdInvestimentos: investimentos.length,
    qtdBens: bens.length,
  };
}

/**
 * Evolução mensal do valor dos investimentos, a partir dos snapshots.
 *
 * Para cada mês, usa o ÚLTIMO snapshot de cada investimento até aquele mês
 * (o valor mais recente conhecido) e soma. Assim um investimento sem snapshot
 * novo num mês mantém o último valor, em vez de sumir do gráfico.
 */
export async function getEvolucaoPatrimonio(ledgerId: string, meses = 6) {
  const hoje = new Date();

  // Snapshots dos investimentos deste espaço.
  const snaps = await db
    .select({
      assetId: assetSnapshots.assetId,
      value: assetSnapshots.value,
      date: assetSnapshots.date,
    })
    .from(assetSnapshots)
    .innerJoin(assets, eq(assetSnapshots.assetId, assets.id))
    .where(
      and(
        eq(assets.ledgerId, ledgerId),
        sql`${assets.kind} in ('fixed_income', 'variable_income')`,
      ),
    )
    .orderBy(asc(assetSnapshots.date));

  const saida: Array<{ mes: string; rotulo: string; valor: number }> = [];

  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1) + i + 1, 0);
    const fimMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

    // Último valor conhecido de cada investimento até o fim deste mês.
    const ultimoPorAtivo = new Map<string, number>();
    for (const s of snaps) {
      if (s.date <= fimMes) ultimoPorAtivo.set(s.assetId, s.value);
    }
    const valor = [...ultimoPorAtivo.values()].reduce((a, b) => a + b, 0);

    saida.push({
      mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d),
      valor,
    });
  }

  return saida;
}
