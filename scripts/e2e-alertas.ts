/**
 * Alertas proativos: o sino do cabeçalho mostra o que precisa de atenção.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-alertas.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions, transactionSplits, categories } from "../src/db/schema";
import { and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `alr-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Alr Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense")))
    .limit(1);

  const [conta] = await db
    .insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 100000 })
    .returning({ id: accounts.id });

  // Despesa PREVISTA com data no passado -> vira "lançamento vencido".
  const [tx] = await db
    .insert(transactions)
    .values({
      ledgerId,
      accountId: conta.id,
      type: "expense",
      status: "pending",
      amount: 50000,
      currency: "BRL",
      amountBase: 50000,
      description: "Aluguel atrasado",
      date: "2026-07-01",
    })
    .returning({ id: transactions.id });
  await db.insert(transactionSplits).values({
    transactionId: tx.id,
    categoryId: cat.id,
    amount: 50000,
    amountBase: 50000,
    sortOrder: 0,
  });

  // ===== Sino de alertas =====
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("sino mostra 1 alerta", await page.getByRole("button", { name: "1 alerta(s)" }).isVisible());

  await page.getByRole("button", { name: "1 alerta(s)" }).click();
  check("abre a lista de alertas", await page.getByRole("button", { name: "1 alerta(s)" }).isVisible());
  check("mostra o lançamento vencido", await page.getByText(/lançamento vencido/).isVisible());
  check("mostra o valor em atraso", await page.getByText(/R\$\s*500,00 em atraso/).isVisible());

  // Clicar leva aos lançamentos.
  await page.getByText(/lançamento vencido/).click();
  await page.waitForURL(/\/lancamentos/, { timeout: 15000 });
  check("alerta leva aos lançamentos", /\/lancamentos/.test(page.url()));

  // ===== Sem pendências: sino fica limpo =====
  await db.update(transactions).set({ status: "cleared" }).where(eq(transactions.id, tx.id));
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("sem pendências, o sino não mostra contador", !(await page.getByRole("button", { name: /alerta\(s\)/ }).isVisible()));

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  console.log("\nusuário de teste removido");
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERRO:", e.message);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u) {
    await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
