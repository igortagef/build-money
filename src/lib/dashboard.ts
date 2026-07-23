import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PAINEL_OCULTOS_PADRAO } from "./dashboard-widgets";

/**
 * Blocos que o usuário escondeu do painel. Quem nunca personalizou (null) herda
 * a lista padrão; quem já salvou (mesmo vazia) manda na própria escolha.
 */
export async function getPainelHidden(userId: string): Promise<Set<string>> {
  const [u] = await db
    .select({ h: users.dashboardHidden })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return new Set(u?.h ?? PAINEL_OCULTOS_PADRAO);
}
