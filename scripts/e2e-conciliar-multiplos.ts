/**
 * Conciliação: selecionar VÁRIOS lançamentos do sistema para UMA linha do banco.
 * Ex.: uma linha de −100 no extrato = dois lançamentos de −30 e −70.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-conciliar-multiplos.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits, bankStatementLines } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `cm-${Date.now()}@teste.local`;
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
  await page.fill("#name", "CM Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 500000 })
    .returning({ id: accounts.id });
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);

  // Dois lançamentos: 30 e 70 (somam 100). Datas distantes para não sugerir auto.
  const [a] = await db.insert(transactions).values({
    ledgerId, accountId: conta.id, type: "expense", status: "cleared",
    amount: 3000, currency: "BRL", amountBase: 3000, description: "Parte A trinta", date: "2026-06-01",
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: a.id, categoryId: cat.id, amount: 3000, amountBase: 3000, sortOrder: 0 });
  const [b] = await db.insert(transactions).values({
    ledgerId, accountId: conta.id, type: "expense", status: "cleared",
    amount: 7000, currency: "BRL", amountBase: 7000, description: "Parte B setenta", date: "2026-06-02",
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: b.id, categoryId: cat.id, amount: 7000, amountBase: 7000, sortOrder: 0 });

  // Linha do banco: −100 (a soma dos dois).
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: conta.id, date: hoje, amount: -10000,
    description: "DEBITO UNICO 100", fitId: `cm-${Date.now()}`, status: "pendente",
  });

  await page.goto(`${BASE}/conciliacao/${conta.id}/extrato`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Buscar lançamento/ }).click();
  // Marca os dois.
  await page.getByText("Parte A trinta").click();
  await page.getByText("Parte B setenta").click();
  await page.getByText(/· bate/).waitFor({ timeout: 8000 });
  check("soma dos selecionados bate com a linha", await page.getByText(/· bate/).isVisible());

  await page.getByRole("button", { name: /Conciliar selecionados/ }).click();
  await page.waitForTimeout(1500);

  const reconc = await db.select().from(transactions)
    .where(and(eq(transactions.accountId, conta.id), eq(transactions.status, "reconciled")));
  check("os dois lançamentos ficaram conferidos", reconc.length === 2, `${reconc.length}`);
  const [linha] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, conta.id));
  check("linha do banco ficou conciliada", linha?.status === "conciliada", linha?.status ?? "");

  await browser.close();
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
