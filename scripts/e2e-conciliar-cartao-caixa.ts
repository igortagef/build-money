/**
 * Ao criar um lançamento de CARTÃO pela conciliação do extrato, a data de caixa
 * deve ser o vencimento da fatura (não a data da compra).
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-conciliar-cartao-caixa.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits, bankStatementLines } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `cc-${Date.now()}@teste.local`;
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
  await page.fill("#name", "CC Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [cartao] = await db.insert(accounts)
    .values({ ledgerId, name: "Cartão", type: "credit_card", currency: "BRL", openingBalance: 0, statementClosingDay: 28, paymentDueDay: 5 })
    .returning({ id: accounts.id });

  // Linha do extrato do cartão: compra −100 em 20/06.
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: cartao.id, date: "2026-06-20", amount: -10000,
    description: "COMPRA LOJA", fitId: `cc-${Date.now()}`, status: "pendente",
  });

  await page.goto(`${BASE}/conciliacao/${cartao.id}/extrato`);
  await page.waitForLoadState("networkidle");
  // Aba "Novo lançamento" já é a padrão; escolhe categoria de despesa e cria.
  const [catExp] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);
  await page.selectOption('select[name="categoryId"]', catExp.id);
  await page.getByRole("button", { name: /Criar e conciliar/ }).click();
  await page.waitForTimeout(1500);

  const [tx] = await db.select({ date: transactions.date, sd: transactions.settlementDate })
    .from(transactions).where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.accountId, cartao.id)));
  check("competência = data da compra (20/06)", tx?.date === "2026-06-20", tx?.date ?? "");
  check("caixa = vencimento da fatura (05/07)", tx?.sd === "2026-07-05", tx?.sd ?? "null");

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
