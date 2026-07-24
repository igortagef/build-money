/**
 * Conciliação: aba "Nova transferência" — uma linha do extrato vira uma
 * transferência entre contas próprias, com a perna da conta conferida e
 * vinculada à linha.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-conciliar-transferencia.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions, transactionSplits, bankStatementLines } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `ct-${Date.now()}@teste.local`;
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
  await page.fill("#name", "CT Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [corrente] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 500000 })
    .returning({ id: accounts.id });
  const [poupanca] = await db.insert(accounts)
    .values({ ledgerId, name: "Poupança", type: "savings", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });

  const hoje = new Date().toISOString().slice(0, 10);
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: corrente.id, date: hoje, amount: -100000,
    description: "TRANSF POUPANCA", fitId: `ct-${Date.now()}`, status: "pendente",
  });

  await page.goto(`${BASE}/conciliacao/${corrente.id}/extrato`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nova transferência/ }).click();
  await page.selectOption('select[name="contaDestinoId"]', poupanca.id);
  await page.getByRole("button", { name: /Criar transferência e conciliar/ }).click();
  await page.waitForTimeout(1500);

  const transfs = await db.select().from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "transfer")));
  const pernaCorrente = transfs.find((t) => t.accountId === corrente.id && t.amount === -100000);
  const pernaPoupanca = transfs.find((t) => t.accountId === poupanca.id && t.amount === 100000);
  check("perna da corrente (−1000) criada e conferida", Boolean(pernaCorrente) && pernaCorrente!.status === "reconciled", pernaCorrente?.status ?? "");
  check("perna da poupança (+1000) criada como realizada", Boolean(pernaPoupanca) && pernaPoupanca!.status === "cleared", pernaPoupanca?.status ?? "");
  check("as duas pernas compartilham o par", Boolean(pernaCorrente?.transferPairId) && pernaCorrente?.transferPairId === pernaPoupanca?.transferPairId);

  const [linha] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, corrente.id));
  check("linha do extrato ficou conciliada e vinculada", linha?.status === "conciliada" && linha?.transactionId === pernaCorrente?.id, linha?.status ?? "");

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
