import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env.local e preencha com a connection string do Neon.",
  );
}

/**
 * Driver por WebSocket, não HTTP.
 *
 * O driver `neon-http` é mais leve, mas NÃO suporta transações de banco
 * ("No transactions support in neon-http driver"). Gravar um lançamento e
 * seus rateios precisa ser atômico: se os rateios falhassem depois do
 * lançamento entrar, sobraria um lançamento sem categoria — e a regra de que
 * todo lançamento é a soma dos seus rateios deixaria de valer no banco.
 */
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { schema };
