/**
 * Conciliação: arquivar uma linha do extrato a tira da fila e a mostra numa tela
 * separada; desarquivar a devolve para a conciliação.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-arquivados.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, bankStatementLines } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `ar-${Date.now()}@teste.local`;
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
  await page.fill("#name", "AR Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });
  await db.insert(bankStatementLines).values({
    ledgerId, accountId: conta.id, date: hoje, amount: -5000,
    description: "TARIFA DUPLICADA", fitId: `ar-${Date.now()}`, status: "pendente",
  });

  // Arquiva a linha pela tela de conciliação.
  await page.goto(`${BASE}/conciliacao/${conta.id}/extrato`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Arquivar$/ }).click();
  await page.waitForTimeout(1200);
  const [dep] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, conta.id));
  check("linha ficou arquivada", dep.status === "arquivada", dep.status);

  // Aparece na tela de arquivados.
  await page.goto(`${BASE}/conciliacao/${conta.id}/arquivados`);
  await page.waitForLoadState("networkidle");
  check("linha aparece nos arquivados", await page.getByText(/TARIFA DUPLICADA/).isVisible());

  // Desarquiva → volta para pendente.
  await page.getByRole("button", { name: /Desarquivar/ }).click();
  await page.waitForTimeout(1200);
  const [dep2] = await db.select().from(bankStatementLines).where(eq(bankStatementLines.accountId, conta.id));
  check("desarquivar volta a linha para pendente", dep2.status === "pendente", dep2.status);

  await browser.close();
  await db.delete(bankStatementLines).where(eq(bankStatementLines.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
