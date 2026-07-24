/**
 * Gráfico de evolução do painel: mostra os totais (entradas/saídas/saldo) e é
 * interativo (tooltip do mês ao passar o mouse).
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-grafico-interativo.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `gi-${Date.now()}@teste.local`;
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
  await page.fill("#name", "GI Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });
  const [catInc] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "income"))).limit(1);
  const [catExp] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);

  // Junho: +1000 / −400 ; Julho: +1000 / −600. Totais: entradas 2000, saídas 1000.
  const lanc = async (tipo: "income" | "expense", valor: number, data: string, cat: string) => {
    const [t] = await db.insert(transactions).values({ ledgerId, accountId: conta.id, type: tipo, status: "cleared", amount: valor, currency: "BRL", amountBase: valor, description: `${tipo} ${data}`, date: data }).returning({ id: transactions.id });
    await db.insert(transactionSplits).values({ transactionId: t.id, categoryId: cat, amount: valor, amountBase: valor, sortOrder: 0 });
  };
  await lanc("income", 100000, "2026-06-10", catInc.id);
  await lanc("expense", 40000, "2026-06-15", catExp.id);
  await lanc("income", 100000, "2026-07-10", catInc.id);
  await lanc("expense", 60000, "2026-07-15", catExp.id);

  await page.goto(`${BASE}/?mes=2026-07`);
  await page.waitForLoadState("networkidle");

  // Totais visíveis.
  check("mostra o total de Entradas (2.000,00)", await page.getByText("R$ 2.000,00").first().isVisible());
  check("mostra o rótulo Saldo do período", await page.getByText("Saldo do período").isVisible());

  // Interatividade: tooltip escondido até o hover.
  const tip = page.getByTestId("tooltip-mes");
  check("tooltip começa escondido", (await tip.count()) === 0);
  // Passa o mouse sobre a última coluna (zona de hover).
  const zonas = page.locator("button[aria-label*='receitas']");
  await zonas.last().hover();
  await page.waitForTimeout(300);
  check("tooltip aparece ao passar o mouse", await tip.isVisible());
  check("tooltip mostra Entradas/Saídas/Saldo", /Entradas/.test(await tip.innerText()) && /Saldo/.test(await tip.innerText()));

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
