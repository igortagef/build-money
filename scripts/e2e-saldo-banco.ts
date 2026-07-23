/**
 * Saldo do banco na conciliação: informar o saldo do extrato e ver a diferença
 * contra o saldo do app na mesma data.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-saldo-banco.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions, bankBalanceChecks } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `sb-${Date.now()}@teste.local`;
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
  await page.fill("#name", "SB Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Conta com abertura 100,00 e uma despesa de 30,00 realizada → app = 70,00.
  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente SB", type: "checking", currency: "BRL", openingBalance: 10000 })
    .returning({ id: accounts.id });
  await db.insert(transactions).values({
    ledgerId, accountId: conta.id, type: "expense", status: "cleared",
    amount: 3000, currency: "BRL", amountBase: 3000, description: "Mercado", date: "2026-07-10",
  });

  const irParaConta = async () => {
    await page.goto(`${BASE}/conciliacao/${conta.id}`);
    await page.waitForLoadState("networkidle");
  };

  // ===== Caso 1: informar 70,00 → bate certo =====
  await irParaConta();
  await page.fill('input[name="data"]', "2026-07-15");
  await page.fill('input[name="saldo"]', "70,00");
  await page.getByRole("button", { name: /Conferir saldo/ }).click();
  await page.getByText(/bate certo/).waitFor({ timeout: 10000 });
  check("saldo igual mostra 'bate certo'", await page.getByText(/bate certo/).isVisible());

  const c1 = await db.select().from(bankBalanceChecks).where(eq(bankBalanceChecks.accountId, conta.id));
  check("gravou a conferência de saldo", c1.length === 1 && c1[0].balance === 7000, `${c1.length}/${c1[0]?.balance}`);

  // ===== Caso 2: informar 90,00 → banco tem 20,00 a mais =====
  await irParaConta();
  await page.fill('input[name="data"]', "2026-07-16");
  await page.fill('input[name="saldo"]', "90,00");
  await page.getByRole("button", { name: /Conferir saldo/ }).click();
  // A conferência mais recente (16) deve reger a tela: diferença 70 - 90 = -20.
  await page.getByText(/banco tem mais do que o app/i).waitFor({ timeout: 10000 });
  check("texto explica banco com mais", await page.getByText(/banco tem mais do que o app/i).isVisible());
  check("diferença de 20,00 aparece", await page.getByText(/20,00/).first().isVisible());

  await browser.close();
  // Limpeza.
  await db.delete(bankBalanceChecks).where(eq(bankBalanceChecks.accountId, conta.id));
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
