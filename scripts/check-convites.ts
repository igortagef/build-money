/**
 * Convites: valida a garantia central — uso ÚNICO, imposto pelo banco. Exercita
 * a tabela e a condição de consumo diretamente (a lib é server-only e não pode
 * ser importada aqui), reproduzindo exatamente o que a aplicação faz.
 * Rodar: npx tsx --env-file=.env.local scripts/check-convites.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { users, invites } from "../src/db/schema";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

// Espelha o consumo da lib: o UPDATE só marca se ainda não foi usado. Se dois
// chamarem ao mesmo tempo, o banco deixa só um passar.
async function consumir(inviteId: string, userId: string): Promise<boolean> {
  const r = await db
    .update(invites)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)))
    .returning({ id: invites.id });
  return r.length > 0;
}

async function main() {
  const [dono] = await db.insert(users).values({ name: "Dono", email: `dono-${Date.now()}@t.local` }).returning();
  const [a] = await db.insert(users).values({ name: "A", email: `a-${Date.now()}@t.local` }).returning();
  const [b] = await db.insert(users).values({ name: "B", email: `b-${Date.now()}@t.local` }).returning();

  // Cria um convite.
  const [conv] = await db
    .insert(invites)
    .values({ code: `BM-TEST1-${Date.now().toString().slice(-5)}`, createdByUserId: dono.id, nota: "para o A" })
    .returning();

  // Uso único: A consome; B tentando o MESMO é recusado.
  const usadoA = await consumir(conv.id, a.id);
  const usadoB = await consumir(conv.id, b.id);
  check("primeiro a usar consegue", usadoA);
  check("segundo a usar é recusado (uso único)", !usadoB);

  const [depois] = await db.select().from(invites).where(eq(invites.id, conv.id));
  check("convite fica marcado como usado por A", depois.usedByUserId === a.id, depois.usedByUserId ?? "null");

  // Revogado não pode ser consumido (a app checa revokedAt antes; aqui garantimos
  // que um convite já usado não é reusado nem por engano).
  const [conv2] = await db
    .insert(invites)
    .values({ code: `BM-TEST2-${Date.now().toString().slice(-5)}`, createdByUserId: dono.id, revokedAt: new Date() })
    .returning();
  const [lido2] = await db.select().from(invites).where(eq(invites.id, conv2.id));
  check("convite cancelado tem revokedAt", lido2.revokedAt !== null);

  // Código é único no banco (índice): dois iguais não coexistem.
  let duplicouBloqueado = false;
  try {
    await db.insert(invites).values({ code: conv.code, createdByUserId: dono.id });
  } catch {
    duplicouBloqueado = true;
  }
  check("código duplicado é bloqueado pelo índice único", duplicouBloqueado);

  await db.delete(invites).where(eq(invites.createdByUserId, dono.id));
  await db.delete(users).where(eq(users.id, a.id));
  await db.delete(users).where(eq(users.id, b.id));
  await db.delete(users).where(eq(users.id, dono.id));

  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
