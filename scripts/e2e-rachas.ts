/**
 * Testa o racha avançado: valor total, minha parte vira despesa, divisão entre
 * N pessoas, baixa individual. Rodar: npx tsx --env-file=.env.local scripts/e2e-rachas.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users,
  ledgers,
  accounts,
  transactions,
  reimbursables,
  reimbursableParticipants,
} from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `racha-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function saldo(ledgerId: string, nome: string): Promise<number> {
  const [conta] = await db
    .select({ id: accounts.id, opening: accounts.openingBalance })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.name, nome)))
    .limit(1);
  if (!conta) return NaN;
  const [mov] = await db
    .select({
      total: sql<number>`coalesce(sum(
        case when ${transactions.status} = 'pending' then 0
             when ${transactions.type} = 'expense' then -${transactions.amount}
             else ${transactions.amount} end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(eq(transactions.accountId, conta.id));
  return conta.opening + mov.total;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("dialog", (d) => d.accept());

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Racha Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "3.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Racha: total 300, minha parte 100, 4 pessoas dividem os 200 =====
  await page.goto(`${BASE}/rachas/novo`);
  await page.fill("#description", "Jantar");
  await page.fill("#total", "300,00");
  await page.fill("#myShare", "100,00");
  await page.selectOption("#categoryId", { label: "Alimentação › Restaurante" });
  // Sobe para 4 pessoas (começa em 2).
  await page.click('button[aria-label="Mais uma pessoa"]');
  await page.click('button[aria-label="Mais uma pessoa"]');
  await page.fill('input[aria-label="Nome da pessoa 1"]', "Ana");
  await page.fill('input[aria-label="Nome da pessoa 2"]', "Bruno");

  // Sem valores, o placar avisa que falta distribuir os 200.
  check("placar avisa quando as partes não fecham", await page.getByText("Faltam").isVisible());

  // VALORES PERSONALIZADOS: Ana e Bruno pagam mais, os outros menos.
  await page.fill('input[aria-label="Valor da pessoa 1"]', "80,00");
  await page.fill('input[aria-label="Valor da pessoa 2"]', "80,00");
  await page.fill('input[aria-label="Valor da pessoa 3"]', "20,00");
  await page.fill('input[aria-label="Valor da pessoa 4"]', "20,00");
  check("placar confirma quando as partes fecham", await page.getByText("As partes fecham").isVisible());

  await page.click('button:has-text("Registrar racha")');
  await page.waitForURL(`${BASE}/rachas`, { timeout: 20000 });

  const [racha] = await db.select().from(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
  check("racha registrado com total 300", racha?.totalAmount === 30000, `${racha?.totalAmount}`);
  check("minha parte 100", racha?.myShare === 10000, `${racha?.myShare}`);
  check("a reembolsar = 200", racha?.amount === 20000, `${racha?.amount}`);

  const parts = await db
    .select()
    .from(reimbursableParticipants)
    .where(eq(reimbursableParticipants.reimbursableId, racha.id))
    .orderBy(reimbursableParticipants.sortOrder);
  check("4 participantes criados", parts.length === 4, `${parts.length}`);
  // Valores personalizados: 80, 80, 20, 20 (não divididos igualmente).
  check("valores individuais respeitados", parts.map((p) => p.amount).join(",") === "8000,8000,2000,2000", parts.map((p) => p.amount).join(","));
  check("soma das cotas = a reembolsar", parts.reduce((s, p) => s + p.amount, 0) === 20000);
  check("nomes preservados", parts[0].name === "Ana" && parts[1].name === "Bruno");
  check("pessoas sem nome ganham rótulo", parts[2].name === "Pessoa 3");

  // ===== Minha parte virou DESPESA de verdade =====
  const despesas = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "expense")));
  check("minha parte gerou uma despesa", despesas.length === 1, `${despesas.length}`);
  check("despesa é dos R$ 100", despesas[0]?.amount === 10000, `${despesas[0]?.amount}`);
  check("despesa descrita como minha parte", despesas[0]?.description === "Jantar (minha parte)");

  // ===== Saldos: saíram os 300 (100 despesa + 200 para a piscina) =====
  check("corrente caiu 300 (3.000 -> 2.700)", (await saldo(ledgerId, "Corrente")) === 270000, `${await saldo(ledgerId, "Corrente")}`);
  check("piscina tem 200 a receber", (await saldo(ledgerId, "Valores a reembolsar")) === 20000, `${await saldo(ledgerId, "Valores a reembolsar")}`);

  // ===== Só a minha parte entra no resultado (não os 300) =====
  await page.goto(`${BASE}/lancamentos?mes=${new Date().toISOString().slice(0, 7)}`);
  await page.waitForLoadState("networkidle");
  const resumo = ((await page.locator("text=Resultado").locator("..").textContent()) ?? "").replace(/\s/g, " ");
  check("resultado do mês só tem minha parte (−100)", resumo.includes("R$ 100,00"), resumo.slice(0, 50));

  // ===== Marcar Ana como paga =====
  await page.goto(`${BASE}/rachas`);
  await page.waitForLoadState("networkidle");
  check("card mostra 0/4 pagaram", await page.getByText("0/4 pagaram").isVisible());
  await page.locator('button[aria-label*="Marcar Ana como pago"]').click();
  await page.waitForTimeout(1600);

  const partsApos = await db
    .select()
    .from(reimbursableParticipants)
    .where(eq(reimbursableParticipants.reimbursableId, racha.id));
  const ana = partsApos.find((p) => p.name === "Ana");
  check("Ana marcada como paga", !!ana?.paidAt);
  // Ana pagou os R$ 80 personalizados dela.
  check("corrente recebeu os 80 da Ana (2.700 -> 2.780)", (await saldo(ledgerId, "Corrente")) === 278000, `${await saldo(ledgerId, "Corrente")}`);
  check("piscina baixou para 120", (await saldo(ledgerId, "Valores a reembolsar")) === 12000, `${await saldo(ledgerId, "Valores a reembolsar")}`);

  const [rApos1] = await db.select().from(reimbursables).where(eq(reimbursables.id, racha.id));
  check("racha registra 80 recebidos", rApos1.settledAmount === 8000, `${rApos1.settledAmount}`);
  check("continua em aberto (faltam 3)", rApos1.status === "open");

  // ===== Todos pagam: racha quita =====
  await page.goto(`${BASE}/rachas`);
  await page.waitForLoadState("networkidle");
  for (const nome of ["Bruno", "Pessoa 3", "Pessoa 4"]) {
    await page.locator(`button[aria-label*="Marcar ${nome} como pago"]`).click();
    await page.waitForTimeout(1400);
  }
  const [rFinal] = await db.select().from(reimbursables).where(eq(reimbursables.id, racha.id));
  check("racha quitado quando todos pagam", rFinal.status === "settled", rFinal.status);
  check("corrente voltou a 2.900 (só a minha parte de 100 saiu)", (await saldo(ledgerId, "Corrente")) === 290000, `${await saldo(ledgerId, "Corrente")}`);
  check("piscina zerada", (await saldo(ledgerId, "Valores a reembolsar")) === 0, `${await saldo(ledgerId, "Valores a reembolsar")}`);

  // ===== Desmarcar reabre =====
  await page.goto(`${BASE}/rachas`);
  await page.waitForLoadState("networkidle");
  await page.locator('button[aria-label*="Desmarcar Ana como pago"]').click();
  await page.waitForTimeout(1600);
  const [rReaberto] = await db.select().from(reimbursables).where(eq(reimbursables.id, racha.id));
  check("desmarcar reabre o racha", rReaberto.status === "open");
  // Desmarcou a Ana (R$ 80): a piscina volta a ter os 80 dela pendentes.
  check("e o saldo volta a refletir o pendente", (await saldo(ledgerId, "Valores a reembolsar")) === 8000, `${await saldo(ledgerId, "Valores a reembolsar")}`);

  await page.screenshot({ path: "scripts/rachas.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
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
    await db.delete(reimbursables).where(eq(reimbursables.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
