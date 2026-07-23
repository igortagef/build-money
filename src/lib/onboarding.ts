import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, budgets, goals, transactions } from "@/db/schema";

/**
 * Progresso dos primeiros passos de quem está começando. Quatro checagens
 * baratas (existe ao menos um?) que alimentam o guia do painel. Some sozinho
 * quando tudo está feito.
 */
export type Onboarding = {
  temConta: boolean;
  temLancamento: boolean;
  temMeta: boolean;
  temOrcamento: boolean;
  tudoFeito: boolean;
};

export async function getOnboarding(ledgerId: string): Promise<Onboarding> {
  const existe = (tabela: typeof accounts | typeof transactions | typeof goals | typeof budgets) =>
    db
      .select({ n: sql<number>`1` })
      .from(tabela)
      .where(eq(tabela.ledgerId, ledgerId))
      .limit(1);

  const [c, t, m, o] = await Promise.all([
    existe(accounts),
    existe(transactions),
    existe(goals),
    existe(budgets),
  ]);

  const temConta = c.length > 0;
  const temLancamento = t.length > 0;
  const temMeta = m.length > 0;
  const temOrcamento = o.length > 0;

  return {
    temConta,
    temLancamento,
    temMeta,
    temOrcamento,
    tudoFeito: temConta && temLancamento && temMeta && temOrcamento,
  };
}
