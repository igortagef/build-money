import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";

/**
 * Indicadores de USABILIDADE para o console de administração.
 *
 * Tudo aqui é agregado do sistema inteiro — contagens e datas, nunca valores
 * financeiros nem conteúdo de lançamento. Serve para responder "as licenças
 * estão sendo usadas?" sem jamais olhar o dinheiro de ninguém.
 */

const DIAS_ATIVO = 7; // abriu na última semana = ativo
const MS_DIA = 86_400_000;

export type IndicadoresAdmin = {
  usuarios: number; // usuários de finanças (não-admin)
  ativos: number; // abriram nos últimos 7 dias
  ociosos: number; // ativos na licença, mas sem abrir há 7+ dias
  nuncaAbriram: number;
  desativados: number;
  novos30d: number; // cadastrados nos últimos 30 dias
  lancamentosTotais: number; // soma de lançamentos no sistema (só contagem)
};

export async function getIndicadoresAdmin(): Promise<IndicadoresAdmin> {
  const agora = Date.now();
  const corteAtivo = new Date(agora - DIAS_ATIVO * MS_DIA);
  const corte30d = new Date(agora - 30 * MS_DIA);

  // Um passe na tabela users, contando por condição. Admins não contam como
  // "usuários" — são back-office, não licenças de finanças.
  const naoAdmin = eq(users.isAdmin, false);

  const [row] = await db
    .select({
      usuarios: count(),
      desativados: sql<number>`count(*) filter (where ${users.deactivatedAt} is not null)`.mapWith(Number),
      ativos: sql<number>`count(*) filter (where ${users.deactivatedAt} is null and ${users.lastSeenAt} >= ${corteAtivo})`.mapWith(Number),
      ociosos: sql<number>`count(*) filter (where ${users.deactivatedAt} is null and ${users.lastSeenAt} is not null and ${users.lastSeenAt} < ${corteAtivo})`.mapWith(Number),
      nuncaAbriram: sql<number>`count(*) filter (where ${users.deactivatedAt} is null and ${users.lastSeenAt} is null)`.mapWith(Number),
      novos30d: sql<number>`count(*) filter (where ${users.createdAt} >= ${corte30d})`.mapWith(Number),
    })
    .from(users)
    .where(naoAdmin);

  const [lanc] = await db.select({ n: count() }).from(transactions);

  return {
    usuarios: Number(row?.usuarios ?? 0),
    ativos: row?.ativos ?? 0,
    ociosos: row?.ociosos ?? 0,
    nuncaAbriram: row?.nuncaAbriram ?? 0,
    desativados: row?.desativados ?? 0,
    novos30d: row?.novos30d ?? 0,
    lancamentosTotais: Number(lanc?.n ?? 0),
  };
}
