/**
 * Conciliação de racha: uma linha do extrato (valor cheio) casa com as DUAS
 * pernas que o racha cria na conta (minha parte + transferência do reembolso).
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-racha-conciliacao.ts
 */
import { chromium } from "playwright";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../src/db";
import {
  users, ledgers, accounts, categories, transactions, transactionSplits,
  reimbursables, reimbursableParticipants, bankStatementLines,
} from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `rc-${Date.now()}@teste.local`;
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
  await page.fill("#name", "RC Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Cartão RC", type: "checking", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);

  // Cria um racha via UI: total 100, minha parte 30, reembolso 70 (uma pessoa).
  await page.goto(`${BASE}/rachas/novo`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="description"]', "Jantar em grupo");
  await page.selectOption('select[name="accountId"]', conta.id);
  await page.fill('input[name="total"]', "100,00");
  await page.fill('input[name="myShare"]', "30,00");
  await page.selectOption('select[name="categoryId"]', cat.id); // aparece após myShare > 0
  await page.fill('input[name="date"]', "2026-07-12");
  // Um participante deve 70,00 (o form já vem com 1 linha; inputs por aria-label).
  await page.getByLabel("Nome da pessoa 1").fill("Amigo");
  await page.getByLabel("Valor da pessoa 1").fill("70,00");
  await page.getByRole("button", { name: /Registrar racha/ }).click();
  await page.waitForURL(/\/rachas$/, { timeout: 15000 });

  // Confere que o racha criou as duas pernas na conta.
  const legs = await db.select().from(transactions)
    .where(and(eq(transactions.accountId, conta.id), ne(transactions.status, "reconciled")));
  const temParte = legs.some((t) => t.type === "expense" && t.amount === 3000);
  const temTransf = legs.some((t) => t.type === "transfer" && t.amount === -7000);
  check("racha criou minha parte (−30)", temParte);
  check("racha criou transferência do reembolso (−70)", temTransf);

  // Injeta a linha do extrato: o banco mostra o débito cheio, −100,00.
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: conta.id, date: "2026-07-12", amount: -10000,
    description: "COMPRA RESTAURANTE", fitId: `rc-${Date.now()}`, status: "pendente",
  });

  // Na tela de conciliação do extrato, a linha deve sugerir o grupo de racha.
  await page.goto(`${BASE}/conciliacao/${conta.id}/extrato`);
  await page.waitForLoadState("networkidle");
  await page.getByText(/Racha \(2 lançamentos\)/).waitFor({ timeout: 10000 });
  check("linha sugere grupo de racha", await page.getByText(/Racha \(2 lançamentos\)/).isVisible());

  await page.getByRole("button", { name: /^Conciliar$/ }).first().click();
  // Conciliada, a linha sai da fila e a sugestão de racha some.
  await page.getByText(/Racha \(2 lançamentos\)/).waitFor({ state: "detached", timeout: 10000 });

  // As duas pernas ficam conferidas e a linha, conciliada.
  const reconc = await db.select().from(transactions)
    .where(and(eq(transactions.accountId, conta.id), eq(transactions.status, "reconciled")));
  check("as duas pernas foram conferidas", reconc.length === 2, `${reconc.length}`);
  const [linha] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, conta.id));
  check("linha do banco ficou conciliada", linha?.status === "conciliada", linha?.status);

  await browser.close();
  // Limpeza respeitando as FKs RESTRICT (rateio→lançamento, racha→conta, lançamento→conta).
  await db.delete(bankStatementLines).where(eq(bankStatementLines.accountId, conta.id));
  const txs = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, ledgerId));
  const rchs = await db.select({ id: reimbursables.id }).from(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
  if (txs.length) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txs.map((t) => t.id)));
  if (rchs.length) await db.delete(reimbursableParticipants).where(inArray(reimbursableParticipants.reimbursableId, rchs.map((r) => r.id)));
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
