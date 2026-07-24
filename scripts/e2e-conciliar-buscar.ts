/**
 * Conciliação: aba "Buscar lançamento" — casar manualmente uma linha do extrato
 * com um lançamento PREVISTO (conta fixa) já existente na conta.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-conciliar-buscar.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits, bankStatementLines } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `cb-${Date.now()}@teste.local`;
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
  await page.fill("#name", "CB Teste");
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

  const hoje = new Date().toISOString().slice(0, 10);
  const dezDiasAtras = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  // Lançamento PREVISTO (pending) datado longe da linha (>3 dias), para NÃO ser
  // sugerido automaticamente — assim testamos mesmo a busca manual.
  const [previsto] = await db.insert(transactions).values({
    ledgerId, accountId: conta.id, type: "expense", status: "pending",
    amount: 20000, currency: "BRL", amountBase: 20000, description: "Assinatura mensal XYZ", date: dezDiasAtras,
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: previsto.id, categoryId: cat.id, amount: 20000, amountBase: 20000, sortOrder: 0 });

  // Linha do extrato de −200 com descrição diferente (não casa automático).
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: conta.id, date: hoje, amount: -20000,
    description: "DEB AUTOMATICO 998877", fitId: `cb-${Date.now()}`, status: "pendente",
  });

  await page.goto(`${BASE}/conciliacao/${conta.id}/extrato`);
  await page.waitForLoadState("networkidle");
  // Abre a aba Buscar e procura pelo previsto.
  await page.getByRole("button", { name: /Buscar lançamento/ }).click();
  await page.fill('input[placeholder="Buscar por descrição…"]', "Assinatura");
  const item = page.getByRole("listitem").filter({ hasText: "Assinatura mensal XYZ" });
  await item.waitFor({ timeout: 8000 });
  check("busca encontra o previsto", await item.isVisible());
  check("marca 'previsto' e 'mesmo valor'", await item.getByText(/previsto/).isVisible() && await item.getByText(/mesmo valor/).isVisible());

  await item.getByRole("button", { name: /^Conciliar$/ }).click();
  await page.waitForTimeout(1500);

  const [depois] = await db.select({ status: transactions.status }).from(transactions).where(eq(transactions.id, previsto.id));
  check("previsto ficou conferido ao casar", depois.status === "reconciled", depois.status);
  const [linha] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, conta.id));
  check("linha vinculada ao lançamento", linha?.status === "conciliada" && linha?.transactionId === previsto.id, linha?.status ?? "");

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
