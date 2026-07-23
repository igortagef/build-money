import "server-only";
import { and, eq, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditCardStatements, transactions } from "@/db/schema";

/**
 * Contadores "de atenção" para o menu: o que precisa de ação agora. Deixam a
 * navegação viva — o usuário vê onde tem pendência sem abrir cada tela. São
 * duas contagens baratas (uma linha cada), porque isto roda a cada navegação.
 */
export async function getAtencaoMenu(ledgerId: string): Promise<{
  lancamentos: number;
  cartoes: number;
}> {
  const hoje = new Date().toISOString().slice(0, 10);

  const [lanc, cart] = await Promise.all([
    // Previstos que já venceram (ou vencem hoje) e esperam baixa.
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(transactions)
      .where(
        and(
          eq(transactions.ledgerId, ledgerId),
          eq(transactions.status, "pending"),
          ne(transactions.type, "transfer"),
          sql`${transactions.supersededByPlanId} is null`,
          lte(transactions.date, hoje),
        ),
      ),
    // Faturas fechadas e ainda não pagas.
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.ledgerId, ledgerId),
          eq(creditCardStatements.status, "closed"),
        ),
      ),
  ]);

  return { lancamentos: lanc[0]?.n ?? 0, cartoes: cart[0]?.n ?? 0 };
}

export type AtencaoMenu = Awaited<ReturnType<typeof getAtencaoMenu>>;
