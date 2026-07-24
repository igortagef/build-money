/**
 * Aporte de investimento: cria uma transferência (conta → Investimentos), sobe
 * o valor aportado, opcionalmente avança uma meta com o mesmo dinheiro, e a
 * transferência é conciliável com o extrato (e fica conferida ao casar).
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-aporte-investimento.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users, ledgers, accounts, assets, assetSnapshots, transactions, transactionSplits,
  goals, goalContributions, bankStatementLines,
} from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `aporte-${Date.now()}@teste.local`;
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
  await page.fill("#name", "Aporte Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Conta corrente de origem, um investimento e uma meta.
  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 500000 })
    .returning({ id: accounts.id });
  const hoje = new Date().toISOString().slice(0, 10);
  const [ativo] = await db.insert(assets)
    .values({ ledgerId, name: "Tesouro Selic", kind: "fixed_income", investedValue: 0, currentValue: 0, currency: "BRL" })
    .returning({ id: assets.id });
  await db.insert(assetSnapshots).values({ assetId: ativo.id, value: 0, date: hoje });
  const [meta] = await db.insert(goals)
    .values({ ledgerId, name: "Reserva", targetAmount: 1000000, currency: "BRL", startDate: hoje, status: "active" })
    .returning({ id: goals.id });

  // Faz o aporte pela UI: R$1.000, vinculado à meta.
  await page.goto(`${BASE}/patrimonio`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Aportar$/ }).click();
  await page.fill(`#valor-${ativo.id}`, "1.000,00");
  await page.selectOption(`#conta-${ativo.id}`, conta.id);
  await page.selectOption(`#meta-${ativo.id}`, meta.id);
  await page.getByRole("button", { name: /Registrar aporte/ }).click();
  await page.waitForTimeout(1500);

  // Transferência criada (duas pernas: −1000 na corrente, +1000 em Investimentos).
  const transfs = await db.select().from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "transfer")));
  const pernaCorrente = transfs.find((t) => t.accountId === conta.id && t.amount === -100000);
  check("transferência debita a conta de origem (−1000)", Boolean(pernaCorrente));
  const [poolCriada] = await db.select().from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.isInvestmentPool, true)));
  check("conta Investimentos criada e fora do net worth", Boolean(poolCriada) && poolCriada.includeInNetWorth === false);
  check("perna de crédito vai para Investimentos (+1000)", transfs.some((t) => t.accountId === poolCriada?.id && t.amount === 100000));

  // Investimento subiu.
  const [ativoDepois] = await db.select().from(assets).where(eq(assets.id, ativo.id));
  check("valor aportado do ativo subiu para 1000", ativoDepois.investedValue === 100000, String(ativoDepois.investedValue));

  // Meta avançou com o mesmo dinheiro.
  const aportesMeta = await db.select().from(goalContributions).where(eq(goalContributions.goalId, meta.id));
  check("meta recebeu o aporte de 1000", aportesMeta.length === 1 && aportesMeta[0].amount === 100000);

  // A transferência é conciliável: injeta a linha do extrato (−1000) e concilia.
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: conta.id, date: hoje, amount: -100000,
    description: "APLIC TESOURO SELIC", fitId: `ap-${Date.now()}`, status: "pendente",
  });
  await page.goto(`${BASE}/conciliacao/${conta.id}/extrato`);
  await page.waitForLoadState("networkidle");
  check("linha do extrato encontra o aporte como par", await page.getByText(/Par encontrado|Par provável/).first().isVisible());
  await page.getByRole("button", { name: /^Conciliar$/ }).first().click();
  await page.waitForTimeout(1500);
  const [conciliada] = await db.select({ status: transactions.status }).from(transactions)
    .where(eq(transactions.id, pernaCorrente!.id));
  check("aporte fica CONFERIDO ao casar com o extrato", conciliada.status === "reconciled", conciliada.status);

  await browser.close();
  // Limpeza (respeita FKs RESTRICT).
  await db.delete(bankStatementLines).where(eq(bankStatementLines.ledgerId, ledgerId));
  await db.delete(goalContributions).where(eq(goalContributions.goalId, meta.id));
  await db.delete(goals).where(eq(goals.ledgerId, ledgerId));
  const txs = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, ledgerId));
  if (txs.length) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txs.map((t) => t.id)));
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(assetSnapshots).where(eq(assetSnapshots.assetId, ativo.id));
  await db.delete(assets).where(eq(assets.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
