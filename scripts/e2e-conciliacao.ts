/**
 * Extrato / conciliação de conta: saldo corrido e marcação de conferido.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-conciliacao.ts
 */
import { chromium } from "playwright";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `conc-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Conc Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [catInc] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "income")))
    .limit(1);
  const [catExp] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense")))
    .limit(1);

  const [conta] = await db
    .insert(accounts)
    .values({
      ledgerId,
      name: "Corrente",
      type: "checking",
      currency: "BRL",
      openingBalance: 100000, // R$ 1.000,00
    })
    .returning({ id: accounts.id });

  async function lanc(desc: string, tipo: "income" | "expense", data: string, valor: number, catId: string) {
    const [tx] = await db
      .insert(transactions)
      .values({
        ledgerId,
        accountId: conta.id,
        type: tipo,
        status: "cleared",
        amount: valor,
        currency: "BRL",
        amountBase: valor,
        description: desc,
        date: data,
      })
      .returning({ id: transactions.id });
    await db.insert(transactionSplits).values({
      transactionId: tx.id,
      categoryId: catId,
      amount: valor,
      amountBase: valor,
      sortOrder: 0,
    });
    return tx.id;
  }

  await lanc("Salário", "income", "2026-07-05", 50000, catInc.id);
  await lanc("Aluguel", "expense", "2026-07-10", 30000, catExp.id);

  // ===== Visão geral da conciliação =====
  await page.goto(`${BASE}/conciliacao`);
  await page.waitForLoadState("networkidle");
  check("seção lista a conta", await page.getByText("Corrente").first().isVisible());
  check("mostra que há itens a conferir", await page.getByText(/2 lançamentos a conferir/).isVisible());

  // ===== Tela da conta, segmentada por dia =====
  await page.goto(`${BASE}/conciliacao/${conta.id}`);
  await page.waitForLoadState("networkidle");
  check("mostra a linha de corte", await page.getByText("Conferido até").isVisible());
  check("mostra o saldo lançado (R$ 1.200,00)", await page.getByText("R$ 1.200,00").first().isVisible());
  check("segmenta por dia (05 de jul.)", await page.getByText(/05 de jul\./).first().isVisible());

  // ===== Conferir o dia inteiro =====
  const botoesDia = page.getByRole("button", { name: /Conferir o dia inteiro/ });
  check("oferece conferir o dia inteiro", (await botoesDia.count()) === 2, `${await botoesDia.count()}`);
  await botoesDia.first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Conferir o dia inteiro/ }).first().click();
  await page.waitForTimeout(1200);

  const restantes = await page.getByRole("button", { name: /Conferir o dia inteiro/ }).count();
  check("todos os dias ficam fechados", restantes === 0, `${restantes}`);

  // O antigo caminho do extrato agora leva para cá.
  await page.goto(`${BASE}/contas/${conta.id}/extrato`);
  await page.waitForURL(/\/conciliacao\//, { timeout: 15000 });
  check("extrato antigo redireciona para a conciliação", /\/conciliacao\//.test(page.url()));

  const conferidosDb = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, conta.id), isNotNull(transactions.reconciledAt)));
  check("banco marcou os dois como conferidos", conferidosDb.length === 2, `${conferidosDb.length}`);

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
