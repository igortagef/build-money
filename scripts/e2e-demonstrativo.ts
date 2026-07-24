/**
 * Demonstrativo diário de conciliação (dois níveis): distingue "conciliado por
 * vínculo" de "conferido por saldo", informa o saldo do banco por dia e mostra
 * a diferença que não fecha.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-demonstrativo.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits, bankStatementLines, bankBalanceChecks } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `dm-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";
const hoje = new Date().toISOString().slice(0, 10);

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "DM Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 100000 })
    .returning({ id: accounts.id });
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);

  // Dois lançamentos realizados hoje: um CONCILIADO POR VÍNCULO (com linha do
  // extrato ligada), outro só CONFERIDO POR SALDO (reconciled, sem vínculo).
  const [comVinculo] = await db.insert(transactions).values({
    ledgerId, accountId: conta.id, type: "expense", status: "reconciled", reconciledAt: new Date(),
    amount: 3000, currency: "BRL", amountBase: 3000, description: "Mercado (extrato)", date: hoje,
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: comVinculo.id, categoryId: cat.id, amount: 3000, amountBase: 3000, sortOrder: 0 });
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: conta.id, date: hoje, amount: -3000, description: "MERCADO",
    fitId: `dm-${Date.now()}`, status: "conciliada", transactionId: comVinculo.id,
  });
  const [semVinculo] = await db.insert(transactions).values({
    ledgerId, accountId: conta.id, type: "expense", status: "reconciled", reconciledAt: new Date(),
    amount: 2000, currency: "BRL", amountBase: 2000, description: "Padaria (manual)", date: hoje,
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: semVinculo.id, categoryId: cat.id, amount: 2000, amountBase: 2000, sortOrder: 0 });

  // Saldo do sistema hoje = 1000 − 30 − 20 = 950.
  await page.goto(`${BASE}/conciliacao/${conta.id}/demonstrativo`);
  await page.waitForLoadState("networkidle");

  check("resumo: 1 com vínculo", await page.getByText("Com vínculo").isVisible());
  check("mostra o nível 'vínculo'", await page.getByText(/vínculo/).first().isVisible());
  check("mostra o nível 'por saldo'", await page.getByText(/por saldo/).first().isVisible());

  // Informa saldo do banco = 900 (diverge do sistema 950 → diferença +50).
  await page.fill('input[name="saldo"]', "900,00");
  await page.getByRole("button", { name: /^Informar$/ }).click();
  await page.waitForTimeout(1200);
  const checks = await db.select().from(bankBalanceChecks).where(eq(bankBalanceChecks.accountId, conta.id));
  check("saldo do banco do dia gravado (900)", checks.some((c) => c.balance === 90000), `${checks.map((c) => c.balance)}`);
  check("demonstrativo mostra a diferença (50,00)", await page.getByText(/50,00/).first().isVisible());

  // Informa o saldo certo (950) → fecha.
  await page.fill('input[name="saldo"]', "950,00");
  await page.getByRole("button", { name: /^Informar$/ }).click();
  await page.getByText(/fecha/).first().waitFor({ timeout: 8000 });
  check("com saldo certo, o dia 'fecha'", await page.getByText(/fecha/).first().isVisible());

  await browser.close();
  await db.delete(bankBalanceChecks).where(eq(bankBalanceChecks.accountId, conta.id));
  await db.delete(bankStatementLines).where(eq(bankStatementLines.ledgerId, ledgerId));
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
