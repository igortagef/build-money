/**
 * Contas: editar dados e excluir. Excluir só é permitido sem lançamentos.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-editar-conta.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `ec-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "EC Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Conta A: com lançamento (não pode excluir). Conta B: vazia (pode excluir).
  const [contaA] = await db.insert(accounts)
    .values({ ledgerId, name: "Conta A", type: "checking", currency: "BRL", openingBalance: 10000 })
    .returning({ id: accounts.id });
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);
  const [tx] = await db.insert(transactions).values({
    ledgerId, accountId: contaA.id, type: "expense", status: "cleared",
    amount: 1000, currency: "BRL", amountBase: 1000, description: "gasto", date: "2026-07-10",
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: tx.id, categoryId: cat.id, amount: 1000, amountBase: 1000, sortOrder: 0 });
  const [contaB] = await db.insert(accounts)
    .values({ ledgerId, name: "Conta B", type: "cash", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });

  // ---- Editar Conta A: muda o nome ----
  await page.goto(`${BASE}/contas/${contaA.id}/editar`);
  await page.waitForLoadState("networkidle");
  await page.fill("#name", "Conta A renomeada");
  await page.getByRole("button", { name: /Salvar alterações/ }).click();
  await page.waitForURL(/\/contas$/, { timeout: 15000 });
  const [aDepois] = await db.select().from(accounts).where(eq(accounts.id, contaA.id));
  check("nome da conta editado", aDepois.name === "Conta A renomeada", aDepois.name);

  // ---- Excluir Conta A (tem lançamento): bloqueada ----
  await page.goto(`${BASE}/contas/${contaA.id}/editar`);
  await page.waitForLoadState("networkidle");
  page.on("dialog", (dial) => dial.accept()); // aceita o confirm()
  await page.getByRole("button", { name: /Excluir conta/ }).click();
  await page.getByText(/não pode ser excluída/i).waitFor({ timeout: 10000 });
  check("excluir conta com lançamento é bloqueado", await page.getByText(/não pode ser excluída/i).isVisible());
  const aAinda = await db.select().from(accounts).where(eq(accounts.id, contaA.id));
  check("conta A continua existindo", aAinda.length === 1);

  // ---- Excluir Conta B (vazia): ok ----
  await page.goto(`${BASE}/contas/${contaB.id}/editar`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Excluir conta/ }).click();
  await page.waitForURL(/\/contas$/, { timeout: 15000 });
  const bDepois = await db.select().from(accounts).where(eq(accounts.id, contaB.id));
  check("conta B (vazia) foi excluída", bDepois.length === 0, `${bDepois.length}`);

  await browser.close();
  const txs = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, ledgerId));
  if (txs.length) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txs.map((t) => t.id)));
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
