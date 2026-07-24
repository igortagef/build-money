import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Verificação de disponibilidade para monitores externos (UptimeRobot etc.).
 * Faz um ping trivial no banco. 200 = tudo de pé; 503 = banco fora. Público e
 * sem dados sensíveis. Sempre dinâmico — não faz sentido cachear saúde.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      status: "ok",
      db: "ok",
      ms: Date.now() - inicio,
      time: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { status: "erro", db: "erro", time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
