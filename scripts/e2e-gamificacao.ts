/**
 * Testa gamificação (XP, ofensiva, conquistas, conciliação) e o regime
 * competência x caixa. Rodar com o dev no ar:
 *   npx tsx --env-file=.env.local scripts/e2e-gamificacao.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users,
  ledgers,
  transactions,
  userProgress,
  userAchievements,
  xpEvents,
} from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `gam-${Date.now()}@teste.local`;
const senha = "senha-de-teste-123";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Gamer Teste");
  await page.fill("#email", email);
  await page.fill("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // --- Check-in diário ---
  const [p1] = await db.select().from(userProgress).where(eq(userProgress.userId, u.id));
  check("check-in criou progresso", !!p1, `xp=${p1?.xp}`);
  check("ofensiva começa em 1", p1?.currentStreak === 1, `${p1?.currentStreak}`);
  check("XP do check-in concedido", (p1?.xp ?? 0) >= 10, `${p1?.xp} XP`);

  // --- Idempotência: navegar mais não pode dar XP de novo ---
  const xpAntes = p1.xp;
  await page.goto(`${BASE}/contas`);
  await page.goto(`${BASE}/categorias`);
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  const [p2] = await db.select().from(userProgress).where(eq(userProgress.userId, u.id));
  check(
    "navegar no mesmo dia NÃO concede XP de novo",
    p2.xp === xpAntes,
    `${xpAntes} -> ${p2.xp}`,
  );

  // --- Cadastrar cartão de crédito com fechamento e vencimento ---
  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Cartão Teste");
  await page.selectOption("#type", "credit_card");
  await page.fill("#statementClosingDay", "28");
  await page.fill("#paymentDueDay", "5");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });
  check("cartão com fechamento e vencimento é aceito", await page.getByText("Cartão Teste").first().isVisible());

  const [pConta] = await db.select().from(userProgress).where(eq(userProgress.userId, u.id));
  check("cadastrar conta rendeu XP da conquista", pConta.xp > p2.xp, `${p2.xp} -> ${pConta.xp}`);

  // --- Lançamento no cartão: competência vs caixa ---
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "500,00");
  await page.fill("#description", "Compra no cartão");
  // Data fixa e conhecida para conferir o cálculo da fatura.
  await page.fill("#date", "2026-07-20");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const txs = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  const compra = txs.find((t) => t.description === "Compra no cartão")!;
  check("competência é a data da compra", compra.date === "2026-07-20", compra.date);
  check(
    "caixa é o vencimento da fatura (fecha 28/07, paga 05/08)",
    compra.settlementDate === "2026-08-05",
    String(compra.settlementDate),
  );

  // --- Conquista de rateio ---
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "300,00");
  await page.fill("#description", "Rateado");
  await page.click('button:has-text("Ratear")');
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.fill('input[aria-label="Valor do rateio 1"]', "200,00");
  await page.selectOption('select[aria-label="Categoria 2"]', { label: "Lazer › Bares" });
  await page.fill('input[aria-label="Valor do rateio 2"]', "100,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const conquistas = await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, u.id));
  const codes = conquistas.map((c) => c.code);
  check("conquista de primeira conta", codes.includes("primeira_conta"));
  check("conquista de primeiro lançamento", codes.includes("primeiro_lancamento"));
  check("conquista de primeiro rateio", codes.includes("primeiro_rateio"), codes.join(", "));

  // --- Conciliação ---
  await page.goto(`${BASE}/lancamentos`);
  const botaoConciliar = page.getByRole("button", { name: /conferir/i }).first();
  const temBotao = (await botaoConciliar.count()) > 0;
  check("lista tem botão de conferir", temBotao);
  if (temBotao) {
    await botaoConciliar.click();
    await page.waitForTimeout(1500);
    const conc = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, u.id));
    check(
      "conciliar desbloqueia conquista",
      conc.map((c) => c.code).includes("primeira_conciliacao"),
    );
  }

  // --- Página de conquistas ---
  await page.goto(`${BASE}/conquistas`);
  await page.waitForLoadState("networkidle");
  check("página mostra o nível", await page.getByText("Primeiro tijolo").first().isVisible());
  check("mostra a ofensiva", await page.getByText("Ofensiva").isVisible());
  check(
    "conquista bloqueada mostra como obter",
    await page.getByText("Abra o app 30 dias seguidos.").isVisible(),
  );
  await page.screenshot({ path: "scripts/conquistas.png", fullPage: true });

  // --- XP não é proporcional ao valor gasto ---
  const eventos = await db.select().from(xpEvents).where(eq(xpEvents.userId, u.id));
  const doLancamento = eventos.filter((e) => e.kind === "transaction_logged");
  const doRateio = eventos.filter((e) => e.kind === "transaction_split");
  check(
    "lançamento de R$ 500 e de R$ 300 valem o mesmo XP base",
    doLancamento.every((e) => e.amount === doLancamento[0].amount),
    "XP não pode premiar quem gasta mais",
  );
  check("rateio vale mais que lançamento simples", (doRateio[0]?.amount ?? 0) > (doLancamento[0]?.amount ?? 0));

  // --- Regime no painel ---
  await page.goto(`${BASE}/?regime=caixa`);
  await page.waitForLoadState("networkidle");
  check("painel aceita regime de caixa", await page.getByText("Caixa").first().isVisible());
  // Em julho/2026, no regime de caixa, a compra do cartão NÃO conta (paga em agosto).
  await page.screenshot({ path: "scripts/painel-caixa.png", fullPage: true });

  check("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));

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
