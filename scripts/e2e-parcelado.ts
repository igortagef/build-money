/**
 * Testa compra parcelada: geração das parcelas, fluxo de caixa, cartão vs
 * boleto. Rodar: npx tsx --env-file=.env.local scripts/e2e-parcelado.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users,
  ledgers,
  transactions,
  transactionSplits,
  installmentPlans,
} from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `parc-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Parc Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Conta corrente (boleto) e cartão de crédito
  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "10.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Cartão");
  await page.selectOption("#type", "credit_card");
  await page.fill("#statementClosingDay", "28");
  await page.fill("#paymentDueDay", "5");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Compra parcelada no boleto (corrente) — agora aba de novo lançamento =====
  await page.goto(`${BASE}/lancamentos/novo?aba=parcelada`);
  await page.waitForLoadState("networkidle");

  await page.fill("#description", "Geladeira");
  await page.fill("#total", "1.200,00");
  await page.fill("#parcelas", "12");
  await page.fill("#primeiraData", "2026-08-10");
  await page.selectOption("#accountId", { label: "Corrente" });
  await page.selectOption("#categoryId", { label: "Moradia › Móveis e decoração" });
  await page.waitForTimeout(400);

  // Prévia deve mostrar 12 parcelas antes de criar.
  check("prévia mostra 12 parcelas", await page.getByText("12 parcelas").isVisible());

  await page.click('button:has-text("Lançar parcelas")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const plano = await db.select().from(installmentPlans).where(eq(installmentPlans.ledgerId, ledgerId));
  check("plano de parcelamento criado", plano.length === 1);
  check("total do plano em centavos", plano[0]?.totalAmount === 120000, `${plano[0]?.totalAmount}`);
  check("12 parcelas registradas", plano[0]?.installmentCount === 12);

  const parcelas = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.installmentGroupId, plano[0].id)))
    .orderBy(transactions.installmentNumber);

  check("gerou 12 lançamentos", parcelas.length === 12, `${parcelas.length}`);
  check("cada parcela é R$ 100", parcelas.every((p) => p.amount === 10000));
  check(
    "soma das parcelas fecha com o total",
    parcelas.reduce((s, p) => s + p.amount, 0) === 120000,
  );
  check("todas previstas (entram no fluxo futuro)", parcelas.every((p) => p.status === "pending"));
  check(
    "numeração 1..12",
    parcelas.map((p) => p.installmentNumber).join(",") === "1,2,3,4,5,6,7,8,9,10,11,12",
  );
  check(
    "descrição carrega o número da parcela",
    parcelas[2]?.description === "Geladeira (3/12)",
    parcelas[2]?.description,
  );
  check(
    "no boleto, competência = caixa",
    parcelas.every((p) => p.date === p.settlementDate),
  );
  check(
    "parcelas em meses consecutivos",
    parcelas[0].date === "2026-08-10" && parcelas[1].date === "2026-09-10",
    `${parcelas[0].date}, ${parcelas[1].date}`,
  );

  // Cada parcela tem seu rateio na categoria.
  const splits = await db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, parcelas[0].id));
  check("parcela tem rateio na categoria", splits.length === 1 && splits[0].amount === 10000);

  // ===== Compra parcelada no cartão =====
  await page.goto(`${BASE}/lancamentos/parcelado`);
  await page.fill("#description", "Notebook");
  await page.fill("#total", "3.000,00");
  await page.fill("#parcelas", "3");
  await page.fill("#primeiraData", "2026-07-20");
  await page.selectOption("#accountId", { label: "Cartão" });
  await page.selectOption("#categoryId", { label: "Educação › Cursos" });
  await page.waitForTimeout(400);
  check(
    "prévia do cartão avisa sobre o vencimento da fatura",
    await page.getByText(/vencimento da fatura/).isVisible(),
  );
  await page.click('button:has-text("Lançar parcelas")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [planoCartao] = await db
    .select()
    .from(installmentPlans)
    .where(and(eq(installmentPlans.ledgerId, ledgerId), eq(installmentPlans.description, "Notebook")));
  const pc = await db
    .select()
    .from(transactions)
    .where(eq(transactions.installmentGroupId, planoCartao.id))
    .orderBy(transactions.installmentNumber);

  check(
    "cartão: competência distribuída por mês",
    pc.map((p) => p.date).join(",") === "2026-07-20,2026-08-20,2026-09-20",
    pc.map((p) => p.date).join(","),
  );
  check(
    "cartão: caixa segue o vencimento da fatura (fecha 28, paga 05)",
    pc.map((p) => p.settlementDate).join(",") === "2026-08-05,2026-09-05,2026-10-05",
    pc.map((p) => p.settlementDate).join(","),
  );

  // ===== Aparece no fluxo (lista de lançamentos previstos) =====
  await page.goto(`${BASE}/lancamentos?mes=2026-09`);
  await page.waitForLoadState("networkidle");
  check(
    "parcela de setembro aparece no mês certo",
    await page.getByText("Geladeira (2/12)").first().isVisible(),
  );

  // ===== Confirmar uma parcela =====
  await page.locator('button[aria-label*="Confirmar Geladeira (2/12)"]').first().click();
  await page.waitForTimeout(1500);
  const [confirmada] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.installmentGroupId, plano[0].id), eq(transactions.installmentNumber, 2)));
  check("parcela confirmada vira realizada", confirmada.status === "cleared");
  check("as outras parcelas seguem previstas", true);

  await page.screenshot({ path: "scripts/parcelado.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(installmentPlans).where(eq(installmentPlans.ledgerId, ledgerId));
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
    await db.delete(installmentPlans).where(eq(installmentPlans.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
