/**
 * Painel: o saldo de contas do tipo "investimento" conta no card de
 * INVESTIMENTOS (não no saldo de contas). Uma transferência de R$500 da conta
 * corrente para uma conta de investimento reclassifica esse valor.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-painel-investimento-conta.ts
 */
import { chromium } from "playwright";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `pi-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function textoDoCard(page: import("playwright").Page, titulo: string): Promise<string> {
  const card = page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: titulo, exact: true }) })
    .first();
  return (await card.innerText()).replace(/\s+/g, " ");
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "PI Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Corrente com R$1000; conta de investimento com R$0.
  const [corrente] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 100000 })
    .returning({ id: accounts.id });
  const [invest] = await db.insert(accounts)
    .values({ ledgerId, name: "XP Invest", type: "investment", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });

  // Transferência de R$500: corrente −500, investimento +500.
  const par = crypto.randomUUID();
  await db.insert(transactions).values([
    { ledgerId, accountId: corrente.id, type: "transfer", status: "cleared", amount: -50000, currency: "BRL", amountBase: -50000, description: "Aplicação", date: "2026-07-10", transferPairId: par },
    { ledgerId, accountId: invest.id, type: "transfer", status: "cleared", amount: 50000, currency: "BRL", amountBase: 50000, description: "Aplicação", date: "2026-07-10", transferPairId: par },
  ]);

  await page.goto(`${BASE}/?mes=2026-07`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500); // AnimatedNumber

  const cardInvest = await textoDoCard(page, "Investimentos");
  check("card de Investimentos mostra os R$500 da conta", /500,00/.test(cardInvest), cardInvest.slice(0, 80));

  const cardSaldo = await textoDoCard(page, "Saldo em contas");
  check("saldo em contas mostra R$500 (não os 1000)", /R\$\s*500,00/.test(cardSaldo) && !/1\.000,00/.test(cardSaldo), cardSaldo.slice(0, 80));

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
