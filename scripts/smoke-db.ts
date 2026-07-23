/**
 * Cria um usuário descartável, roda o seed e confere o resultado no banco.
 * Apaga tudo ao final.
 * Rodar: npx tsx --env-file=.env.local scripts/smoke-db.ts
 */
import { db } from "../src/db";
import { users, ledgers, categories, costCenters } from "../src/db/schema";
import { createPersonalLedger } from "../src/db/seed";
import { eq, and, isNull, count } from "drizzle-orm";

async function main() {
  const email = `smoke-${Date.now()}@teste.local`;

  const [user] = await db
    .insert(users)
    .values({ email, name: "Usuário de teste" })
    .returning();
  console.log("usuário criado:", user.id);

  const ledger = await createPersonalLedger(user.id, { name: "Teste" });
  console.log("espaço criado:", ledger.id, "| moeda base:", ledger.baseCurrency);

  const [refreshedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id));
  console.log(
    "defaultLedgerId apontando para o espaço:",
    refreshedUser.defaultLedgerId === ledger.id,
  );

  const [ccCount] = await db
    .select({ n: count() })
    .from(costCenters)
    .where(eq(costCenters.ledgerId, ledger.id));

  const [expenseCount] = await db
    .select({ n: count() })
    .from(categories)
    .where(
      and(eq(categories.ledgerId, ledger.id), eq(categories.type, "expense")),
    );

  const [incomeCount] = await db
    .select({ n: count() })
    .from(categories)
    .where(
      and(eq(categories.ledgerId, ledger.id), eq(categories.type, "income")),
    );

  const [rootExpense] = await db
    .select({ n: count() })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledger.id),
        eq(categories.type, "expense"),
        isNull(categories.parentId),
      ),
    );

  console.log("centros de custo:", ccCount.n);
  console.log("categorias de despesa:", expenseCount.n, `(${rootExpense.n} grupos)`);
  console.log("categorias de receita:", incomeCount.n);

  // Confere se o centro de custo foi herdado corretamente pelas subcategorias.
  const aluguel = await db
    .select({
      name: categories.name,
      costCenter: costCenters.name,
      parent: categories.parentId,
    })
    .from(categories)
    .leftJoin(costCenters, eq(categories.costCenterId, costCenters.id))
    .where(
      and(eq(categories.ledgerId, ledger.id), eq(categories.name, "Aluguel")),
    );
  console.log("subcategoria de exemplo:", aluguel[0]);

  const salario = await db
    .select({ name: categories.name, costCenter: costCenters.name })
    .from(categories)
    .leftJoin(costCenters, eq(categories.costCenterId, costCenters.id))
    .where(
      and(eq(categories.ledgerId, ledger.id), eq(categories.name, "13º salário")),
    );
  console.log("receita de exemplo:", salario[0]);

  // Limpeza: apagar o usuário deve levar junto tudo por cascade.
  await db.delete(ledgers).where(eq(ledgers.id, ledger.id));
  await db.delete(users).where(eq(users.id, user.id));

  const [leftovers] = await db
    .select({ n: count() })
    .from(categories)
    .where(eq(categories.ledgerId, ledger.id));
  console.log("categorias órfãs após apagar o espaço:", leftovers.n);

  console.log("\nsmoke test concluído.");
}

main().catch((err) => {
  console.error("FALHOU:", err);
  process.exit(1);
});
