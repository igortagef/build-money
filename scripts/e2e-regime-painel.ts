/**
 * Regime competência × caixa no painel: uma compra de cartão em JUNHO com
 * vencimento (caixa) em JULHO deve:
 *   - aparecer na despesa de JUNHO em COMPETÊNCIA
 *   - NÃO aparecer na despesa de JUNHO em CAIXA
 *   - aparecer na despesa de JULHO em CAIXA
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-regime-painel.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `rp-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function despesaDoPainel(page: import("playwright").Page): Promise<string> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500); // AnimatedNumber
  const card = page.locator("a", { hasText: "Despesas do mês" }).first();
  return (await card.innerText()).replace(/\s+/g, " ");
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "RP Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [cartao] = await db.insert(accounts)
    .values({ ledgerId, name: "Cartão", type: "credit_card", currency: "BRL", openingBalance: 0, statementClosingDay: 28, paymentDueDay: 5 })
    .returning({ id: accounts.id });
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);

  // Compra 20/06 (competência junho); vencimento 05/07 (caixa julho).
  const [tx] = await db.insert(transactions).values({
    ledgerId, accountId: cartao.id, type: "expense", status: "cleared",
    amount: 10000, currency: "BRL", amountBase: 10000, description: "Compra cartão",
    date: "2026-06-20", settlementDate: "2026-07-05",
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: tx.id, categoryId: cat.id, amount: 10000, amountBase: 10000, sortOrder: 0 });

  await page.goto(`${BASE}/?mes=2026-06`);
  const junhoComp = await despesaDoPainel(page);
  check("junho COMPETÊNCIA mostra a despesa (100,00)", /100,00/.test(junhoComp), junhoComp);

  await page.goto(`${BASE}/?mes=2026-06&regime=caixa`);
  const junhoCaixa = await despesaDoPainel(page);
  check("junho CAIXA não mostra a despesa (0,00)", /R\$\s*0,00/.test(junhoCaixa) && !/100,00/.test(junhoCaixa), junhoCaixa);

  await page.goto(`${BASE}/?mes=2026-07&regime=caixa`);
  const julhoCaixa = await despesaDoPainel(page);
  check("julho CAIXA mostra a despesa (100,00)", /100,00/.test(julhoCaixa), julhoCaixa);

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
