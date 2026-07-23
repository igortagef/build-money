import { db } from "./index";
import { assetKinds, categories, costCenters, ledgers, ledgerMembers, users } from "./schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_COST_CENTERS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  CATEGORY_COST_CENTER,
  type SeedCategory,
} from "./seed-data";
import type { CategoryType, CurrencyCode } from "./schema";

/**
 * Cria o espaço pessoal de um usuário recém-cadastrado, já com os centros de
 * custo e o plano de categorias sugeridos. Chamado uma vez, no cadastro.
 */
export async function createPersonalLedger(
  userId: string,
  options: { name?: string; baseCurrency?: CurrencyCode } = {},
) {
  const [ledger] = await db
    .insert(ledgers)
    .values({
      name: options.name ?? "Minhas finanças",
      baseCurrency: options.baseCurrency ?? "BRL",
      ownerId: userId,
      isPersonal: true,
    })
    .returning();

  await db.insert(ledgerMembers).values({
    ledgerId: ledger.id,
    userId,
    role: "owner",
  });

  await db
    .update(users)
    .set({ defaultLedgerId: ledger.id })
    .where(eq(users.id, userId));

  await seedLedgerDefaults(ledger.id);

  return ledger;
}

/** Popula um espaço com os centros de custo e categorias sugeridos. */
export async function seedLedgerDefaults(ledgerId: string) {
  const insertedCostCenters = await db
    .insert(costCenters)
    .values(
      DEFAULT_COST_CENTERS.map((cc) => ({
        ledgerId,
        name: cc.name,
        description: cc.description,
        color: cc.color,
        icon: cc.icon,
      })),
    )
    .returning({ id: costCenters.id, name: costCenters.name });

  const costCenterIds = new Map(
    insertedCostCenters.map((cc) => [cc.name, cc.id]),
  );

  await seedCategoryTree(
    ledgerId,
    DEFAULT_EXPENSE_CATEGORIES,
    "expense",
    costCenterIds,
  );
  await seedCategoryTree(
    ledgerId,
    DEFAULT_INCOME_CATEGORIES,
    "income",
    costCenterIds,
  );

  // Tipos de bem iniciais — a lista é editável depois em Cadastros › Bens.
  await db.insert(assetKinds).values(
    ["Imóvel", "Veículo", "Outro"].map((name, i) => ({
      ledgerId,
      name,
      sortOrder: i,
    })),
  );
}

async function seedCategoryTree(
  ledgerId: string,
  tree: SeedCategory[],
  type: CategoryType,
  costCenterIds: Map<string, string>,
) {
  const parents = await db
    .insert(categories)
    .values(
      tree.map((cat, i) => ({
        ledgerId,
        type,
        name: cat.name,
        icon: cat.icon,
        isDefault: true,
        sortOrder: i,
        costCenterId:
          costCenterIds.get(CATEGORY_COST_CENTER[cat.name] ?? "") ?? null,
      })),
    )
    .returning({ id: categories.id, name: categories.name });

  const parentIds = new Map(parents.map((p) => [p.name, p.id]));

  const children = tree.flatMap((cat) =>
    (cat.children ?? []).map((childName, i) => ({
      ledgerId,
      type,
      name: childName,
      parentId: parentIds.get(cat.name)!,
      isDefault: true,
      sortOrder: i,
      // Subcategoria herda o centro de custo do pai.
      costCenterId:
        costCenterIds.get(CATEGORY_COST_CENTER[cat.name] ?? "") ?? null,
    })),
  );

  if (children.length > 0) {
    await db.insert(categories).values(children);
  }
}
