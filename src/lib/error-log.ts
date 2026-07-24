import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { errorLog } from "@/db/schema";

/**
 * Registro de erros de servidor. Alimentado pelo hook `onRequestError` da
 * instrumentação; nunca pode gerar outro erro (engole falhas). Guarda só o
 * técnico — mensagem, stack, rota —, nada de dado financeiro.
 */
export async function registrarErro(dados: {
  message: string;
  stack?: string | null;
  digest?: string | null;
  path?: string | null;
  method?: string | null;
  routeType?: string | null;
}): Promise<void> {
  try {
    await db.insert(errorLog).values({
      message: dados.message.slice(0, 2000),
      stack: dados.stack ? dados.stack.slice(0, 8000) : null,
      digest: dados.digest ?? null,
      path: dados.path ?? null,
      method: dados.method ?? null,
      routeType: dados.routeType ?? null,
    });
  } catch {
    // Registrar erro jamais derruba a requisição.
  }
}

/** Últimos erros registrados, para o painel do admin. */
export async function listarErros(limite = 100) {
  return db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(limite);
}
