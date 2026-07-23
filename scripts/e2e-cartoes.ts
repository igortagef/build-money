/**
 * Cartão de crédito: faturas rastreáveis, fechamento (manual) e reparcelamento.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-cartoes.ts
 */
import { chromium } from "playwright";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  users,
  ledgers,
  accounts,
  categories,
  transactions,
  transactionSplits,
  installmentPlans,
  creditCardStatements,
} from "../src/db/schema";
import { gerarParcelas } from "../src/lib/installments";

const BASE = "http://localhost:3000";
const email = `cart-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

const CARTAO = { fecha: 28, vence: 5 };

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1300 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Cartão Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Categoria de despesa existente (do seed).
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense")))
    .limit(1);

  // Cartão configurado (fecha 28, vence 5).
  const [card] = await db
    .insert(accounts)
    .values({
      ledgerId,
      name: "Cartão Nu",
      type: "credit_card",
      currency: "BRL",
      creditLimit: 500000,
      statementClosingDay: CARTAO.fecha,
      paymentDueDay: CARTAO.vence,
    })
    .returning({ id: accounts.id });
  const cardId = card.id;

  async function compra(desc: string, comp: string, settle: string, valor: number, status: "cleared" | "pending", plano?: string, num?: number, tot?: number) {
    const [tx] = await db
      .insert(transactions)
      .values({
        ledgerId,
        accountId: cardId,
        type: "expense",
        status,
        amount: valor,
        currency: "BRL",
        amountBase: valor,
        description: desc,
        date: comp,
        settlementDate: settle,
        installmentGroupId: plano ?? null,
        installmentNumber: num ?? null,
        installmentTotal: tot ?? null,
      })
      .returning({ id: transactions.id });
    await db.insert(transactionSplits).values({
      transactionId: tx.id,
      categoryId: cat.id,
      amount: valor,
      amountBase: valor,
      sortOrder: 0,
    });
    return tx.id;
  }

  // Compra avulsa na fatura que vence 05/08 (competência 10/07).
  await compra("Mercado", "2026-07-10", "2026-08-05", 20000, "cleared");

  // Parcelamento 3x de R$ 900 (R$ 300 cada), começando em 10/07.
  const [plano] = await db
    .insert(installmentPlans)
    .values({
      ledgerId,
      accountId: cardId,
      description: "Geladeira",
      totalAmount: 90000,
      currency: "BRL",
      installmentCount: 3,
      firstDueDate: "2026-07-10",
      purchaseDate: "2026-07-10",
    })
    .returning({ id: installmentPlans.id });

  const parcelas = gerarParcelas(90000, 3, "2026-07-10", {
    type: "credit_card",
    statementClosingDay: CARTAO.fecha,
    paymentDueDay: CARTAO.vence,
  });
  for (const p of parcelas) {
    await compra(`Geladeira (${p.numero}/3)`, p.data, p.dataCaixa, p.valor, "pending", plano.id, p.numero, 3);
  }
  // Parcela 1 cai na fatura 05/08 (junto com o Mercado): total 20000+30000 = 50000.

  // ===== Lista de cartões =====
  await page.goto(`${BASE}/cartoes`);
  await page.waitForLoadState("networkidle");
  check("lista mostra o cartão", await page.getByText("Cartão Nu").first().isVisible());
  check("mostra a fatura aberta (R$ 500,00)", await page.getByText("R$ 500,00").first().isVisible());

  // ===== Detalhe: faturas rastreáveis =====
  await page.goto(`${BASE}/cartoes/${cardId}`);
  await page.waitForLoadState("networkidle");
  // As faturas vêm da mais nova (05/10) para a mais antiga; escopa no bloco 05/08.
  const bloco = page.locator("details").filter({ hasText: "05 de ago. de 2026" });
  check("detalhe mostra o Mercado", await bloco.getByText("Mercado").first().isVisible());
  check("detalhe mostra a parcela da geladeira", await bloco.getByText("Geladeira").first().isVisible());
  check("marca a parcela 1/3", await bloco.getByText("1/3").first().isVisible());
  check("mostra o vencimento 05/08", await bloco.getByText(/05 de ago\. de 2026/).first().isVisible());

  // ===== Fechar a fatura de 05/08 (fechamento manual antecipado) =====
  await bloco.getByRole("button", { name: /Fechar fatura/ }).click();
  await bloco.getByText("Fechada").waitFor({ timeout: 15000 });
  check("fatura fica 'Fechada'", await bloco.getByText("Fechada").isVisible());

  // O menu ganha selo de atenção (fatura fechada a pagar / previstos vencidos).
  await page.goto(`${BASE}/cartoes`);
  await page.waitForLoadState("networkidle");
  check("menu mostra selo de atenção dinâmico", (await page.getByLabel(/pendente/).count()) > 0);

  const [stmt] = await db
    .select()
    .from(creditCardStatements)
    .where(and(eq(creditCardStatements.accountId, cardId), eq(creditCardStatements.dueDate, "2026-08-05")));
  check("fatura persistida no banco", Boolean(stmt), stmt ? stmt.status : "sem registro");
  check("total congelado = 50000", stmt?.totalAmount === 50000, `${stmt?.totalAmount}`);
  const carimbadas = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, cardId), eq(transactions.statementId, stmt.id)));
  check("compras carimbadas com o statement_id", carimbadas.length === 2, `${carimbadas.length}`);

  // ===== Reparcelar a fatura (refinancia a parcela em aberto 1/3) =====
  await bloco.getByRole("button", { name: /^Reparcelar/ }).click();
  await bloco.locator("select[name='parcelas']").selectOption("6");
  await bloco.getByRole("button", { name: /Confirmar reparcelamento/ }).click();
  // "Reparcelada" (badge) x "reparcelada" (tag do movimento): exact é sensível a caixa.
  await bloco.getByText("Reparcelada", { exact: true }).waitFor({ timeout: 15000 });
  check("fatura fica 'Reparcelada'", await bloco.getByText("Reparcelada", { exact: true }).isVisible());

  const planos = await db
    .select()
    .from(installmentPlans)
    .where(and(eq(installmentPlans.ledgerId, ledgerId), eq(installmentPlans.kind, "reparcelamento")));
  check("novo plano de reparcelamento criado", planos.length === 1, `${planos.length}`);
  check("plano tem 6 parcelas", planos[0]?.installmentCount === 6, `${planos[0]?.installmentCount}`);
  check("plano aponta para a fatura de origem", planos[0]?.sourceStatementId === stmt.id);

  const superseded = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, cardId), eq(transactions.supersededByPlanId, planos[0].id)));
  check("parcela original marcada como reparcelada", superseded.length === 1, `${superseded.length}`);

  const novas = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, cardId), eq(transactions.installmentGroupId, planos[0].id)));
  check("6 novas parcelas geradas", novas.length === 6, `${novas.length}`);
  const somaNovas = novas.reduce((s, t) => s + t.amount, 0);
  check("soma das novas parcelas = 30000 (sem juros)", somaNovas === 30000, `${somaNovas}`);

  const [stmtR] = await db
    .select()
    .from(creditCardStatements)
    .where(eq(creditCardStatements.id, stmt.id));
  check("fatura de origem marcada reparcelada", stmtR?.status === "reparcelada", stmtR?.status);
  check("fatura de origem aponta para o plano", stmtR?.reparceladoPlanId === planos[0].id);

  // ===== A parcela reparcelada saiu da lista de lançamentos =====
  await page.goto(`${BASE}/lancamentos?mes=2026-08&tipo=expense`);
  await page.waitForLoadState("networkidle");
  check(
    "lançamentos não mostra a parcela reparcelada (1/3)",
    !(await page.getByText("Geladeira (1/3)").first().isVisible()),
  );

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await limpar(ledgerId, u.id);
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

async function limpar(ledgerId: string, userId: string) {
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(creditCardStatements).where(eq(creditCardStatements.ledgerId, ledgerId));
  await db.delete(installmentPlans).where(eq(installmentPlans.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.ownerId, userId));
  await db.delete(users).where(eq(users.id, userId));
  console.log("\nusuário de teste removido");
}

main().catch(async (e) => {
  console.error("ERRO:", e.message);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u) await limpar(u.defaultLedgerId!, u.id);
  process.exit(1);
});
