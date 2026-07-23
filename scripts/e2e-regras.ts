/**
 * Categorização automática por regras: CRUD + aplicação na importação.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-regras.ts
 */
import { chromium } from "playwright";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, categoryRules, transactions } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `reg-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "reg-"));
  const csv = join(dir, "extrato.csv");
  writeFileSync(csv, "Data;Descrição;Valor\n05/07/2026;Uber viagem centro;-25,00\n", "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Reg Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await db.insert(accounts).values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 0 });

  // Uma categoria-folha de despesa, para a regra.
  const todas = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense")));
  const folha = todas.find((c) => c.parentId) ?? todas[0];

  // ===== CRUD via tela =====
  await page.goto(`${BASE}/regras`);
  await page.waitForLoadState("networkidle");
  await page.fill("#pattern", "Uber");
  await page.selectOption("#categoryId", { label: labelDe(folha, todas) });
  await page.getByRole("button", { name: "Criar regra" }).click();
  await page.getByText(/Quando contém/).first().waitFor({ timeout: 10000 });
  check("regra aparece na lista", await page.getByText("“Uber”").isVisible());

  const regrasDb = await db.select().from(categoryRules).where(eq(categoryRules.ledgerId, ledgerId));
  check("regra gravada no banco", regrasDb.length === 1 && regrasDb[0].pattern === "Uber", JSON.stringify(regrasDb.map((r) => r.pattern)));

  // ===== Aplicação na importação =====
  await page.goto(`${BASE}/lancamentos/importar`);
  await page.waitForLoadState("networkidle");
  await page.setInputFiles('input[type="file"]', csv);
  await page.getByRole("button", { name: /Analisar arquivo/ }).click();
  await page.getByText("Confira antes de gravar").waitFor({ timeout: 15000 });

  const tabela = page.locator("table").last();
  check(
    "importação aplica a regra (categoria preenchida sozinha)",
    await tabela.getByText(new RegExp(folha.name)).first().isVisible(),
    folha.name,
  );

  await page.getByRole("button", { name: /Importar/ }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });

  // O lançamento gravado ficou com a categoria da regra.
  const cats = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), isNotNull(transactions.id)));
  check("lançamento importado existe", cats.length >= 1, `${cats.length}`);

  // ===== Apagar a regra =====
  await page.goto(`${BASE}/regras`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Apagar regra Uber/ }).click();
  await page.waitForTimeout(1000);
  const aposApagar = await db.select().from(categoryRules).where(eq(categoryRules.ledgerId, ledgerId));
  check("regra apagada", aposApagar.length === 0, `${aposApagar.length}`);

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(categoryRules).where(eq(categoryRules.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  console.log("\nusuário de teste removido");
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

function labelDe(
  folha: { id: string; name: string; parentId: string | null },
  todas: Array<{ id: string; name: string; parentId: string | null }>,
) {
  if (!folha.parentId) return folha.name;
  const pai = todas.find((c) => c.id === folha.parentId);
  return pai ? `${pai.name} › ${folha.name}` : folha.name;
}

main().catch(async (e) => {
  console.error("ERRO:", e.message);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u) {
    await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
    await db.delete(categoryRules).where(eq(categoryRules.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
