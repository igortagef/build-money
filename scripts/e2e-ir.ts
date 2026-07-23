/**
 * Relatório anual de Imposto de Renda: rendimentos, bens e dívidas em 31/12.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-ir.ts
 */
import { chromium } from "playwright";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `ir-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1300 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "IR Teste");
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

  // Conta corrente com saldo de abertura + um salário no ano.
  const [corrente] = await db
    .insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 200000 })
    .returning({ id: accounts.id });
  const [sal] = await db
    .insert(transactions)
    .values({
      ledgerId,
      accountId: corrente.id,
      type: "income",
      status: "cleared",
      amount: 500000,
      currency: "BRL",
      amountBase: 500000,
      description: "Salário",
      date: "2026-03-10",
    })
    .returning({ id: transactions.id });
  await db.insert(transactionSplits).values({
    transactionId: sal.id,
    categoryId: catInc.id,
    amount: 500000,
    amountBase: 500000,
    sortOrder: 0,
  });

  // Cartão com uma compra -> saldo devedor (dívida).
  const [cartao] = await db
    .insert(accounts)
    .values({ ledgerId, name: "Cartão", type: "credit_card", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });
  await db.insert(transactions).values({
    ledgerId,
    accountId: cartao.id,
    type: "expense",
    status: "cleared",
    amount: 30000,
    currency: "BRL",
    amountBase: 30000,
    description: "Compra",
    date: "2026-05-10",
  });

  // ===== Relatório de IR de 2026 =====
  await page.goto(`${BASE}/relatorios/ir?ano=2026`);
  await page.waitForLoadState("networkidle");

  check("mostra rendimentos do ano (R$ 5.000,00)", await page.getByText("R$ 5.000,00").first().isVisible());
  check("bens em 31/12 mostram a conta (R$ 7.000,00)", await page.getByText("R$ 7.000,00").first().isVisible());
  check("dívidas mostram a fatura do cartão (R$ 300,00)", await page.getByText("R$ 300,00").first().isVisible());
  check("patrimônio líquido correto (R$ 6.700,00)", await page.getByText("R$ 6.700,00").first().isVisible());

  // ===== Exportação CSV =====
  const download = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("link", { name: /Exportar \(CSV\)/ }).click(),
  ]).then(([d]) => d);
  const caminho = await download.path();
  const conteudo = caminho ? (await import("fs")).readFileSync(caminho, "utf8") : "";
  check(
    "CSV tem as três seções",
    conteudo.includes("RENDIMENTOS") && conteudo.includes("BENS E DIREITOS") && conteudo.includes("DÍVIDAS"),
  );

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
