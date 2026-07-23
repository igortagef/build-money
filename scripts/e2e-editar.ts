/**
 * Testa a edição de lançamentos: valor, categoria, rateio, previsto que vira
 * realizado, e as proteções (sem XP dobrado, conciliado não rebaixa, vínculo
 * com conta fixa preservado).
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-editar.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users,
  ledgers,
  transactions,
  transactionSplits,
  userProgress,
} from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `edit-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Edit Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta");
  await page.fill("#openingBalance", "5.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Cria um lançamento simples =====
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "100,00");
  await page.fill("#description", "Mercado");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [tx] = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  const [xpAntes] = await db.select().from(userProgress).where(eq(userProgress.userId, u.id));

  // ===== Editar: valor, descrição e categoria =====
  await page.goto(`${BASE}/lancamentos/${tx.id}/editar`);
  await page.waitForLoadState("networkidle");
  check(
    "form de edição vem preenchido com o valor atual",
    (await page.inputValue("#amount")) === "100,00",
    `campo tem "${await page.inputValue("#amount")}"`,
  );
  check(
    "e com a descrição atual",
    (await page.inputValue("#description")) === "Mercado",
  );
  check(
    "e com a categoria atual selecionada",
    (await page.locator('select[aria-label="Categoria 1"]').inputValue()).length > 0,
  );

  await page.fill("#amount", "150,00");
  await page.fill("#description", "Mercado do mês");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Feira e hortifruti" });
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [editado] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
  check("valor foi atualizado no banco", editado.amount === 15000, `${editado.amount}`);
  check("descrição atualizada", editado.description === "Mercado do mês");
  check("mesmo id (não criou outro)", editado.id === tx.id);

  const splitsEd = await db.select().from(transactionSplits).where(eq(transactionSplits.transactionId, tx.id));
  check("continua com 1 rateio", splitsEd.length === 1, `${splitsEd.length}`);
  check("rateio acompanha o novo valor", splitsEd[0]?.amount === 15000, `${splitsEd[0]?.amount}`);

  const totalTx = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("não duplicou o lançamento", totalTx.length === 1, `${totalTx.length}`);

  // ===== Editar NÃO concede XP de novo =====
  const [xpDepois] = await db.select().from(userProgress).where(eq(userProgress.userId, u.id));
  check(
    "editar não paga XP de novo",
    xpDepois.xp === xpAntes.xp,
    `${xpAntes.xp} -> ${xpDepois.xp}`,
  );

  // ===== Transformar em rateio pela edição =====
  await page.goto(`${BASE}/lancamentos/${tx.id}/editar`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Ratear")');
  await page.fill('input[aria-label="Valor do rateio 1"]', "100,00");
  await page.selectOption('select[aria-label="Categoria 2"]', { label: "Lazer › Bares" });
  await page.fill('input[aria-label="Valor do rateio 2"]', "50,00");
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const splitsR = await db.select().from(transactionSplits).where(eq(transactionSplits.transactionId, tx.id));
  check("edição transformou em 2 rateios", splitsR.length === 2, `${splitsR.length}`);
  check(
    "soma dos rateios bate com o total",
    splitsR.reduce((s, x) => s + x.amount, 0) === 15000,
  );

  // ===== Conciliar e então editar: não rebaixa =====
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");
  await page.locator('button[aria-label*="Conferir Mercado"]').first().click();
  await page.waitForTimeout(1500);
  const [conciliado] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
  check("lançamento foi conciliado", conciliado.status === "reconciled");

  await page.goto(`${BASE}/lancamentos/${tx.id}/editar`);
  await page.waitForLoadState("networkidle");
  check(
    "conciliado não mostra seletor de situação",
    (await page.locator("#status").count()) === 0,
    "mudar situação desfaria a conciliação",
  );
  // Volta para categoria única (a linha passa a usar o total automaticamente)
  // antes de mudar o valor — senão o rateio de 150 não fecharia com 180.
  await page.click('button:has-text("Categoria única")');
  await page.fill("#amount", "180,00");
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [aposEditar] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
  check("editar um conciliado mantém conciliado", aposEditar.status === "reconciled", aposEditar.status);
  check("mas o valor mudou", aposEditar.amount === 18000, `${aposEditar.amount}`);

  // ===== Conta fixa de valor variável: editar o previsto =====
  await page.goto(`${BASE}/contas-fixas/nova`);
  await page.fill("#description", "Energia elétrica");
  await page.fill("#amount", "200,00");
  await page.selectOption("#categoryId", { label: "Moradia › Energia elétrica" });
  await page.fill("#dayOfMonth", "15");
  await page.fill("#startDate", "2026-07-01");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas-fixas`, { timeout: 20000 });

  const previstos = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.status, "pending")));
  const umPrevisto = previstos[0];
  check("conta fixa gerou previstos", previstos.length >= 12, `${previstos.length}`);
  check("previsto começa com o valor da regra", umPrevisto.amount === 20000);
  const regraId = umPrevisto.recurringRuleId;

  // Energia varia: ajusto o valor real do mês, mantendo o vínculo com a regra.
  await page.goto(`${BASE}/lancamentos/${umPrevisto.id}/editar`);
  await page.waitForLoadState("networkidle");
  check(
    "aviso explica o caso da conta fixa variável",
    await page.getByText(/conta fixa que varia/).isVisible(),
  );
  await page.fill("#amount", "247,83");
  // Previsto usa a checkbox de baixa "Já paguei" em vez do seletor de situação.
  await page.getByText(/Já paguei/).click();
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [energiaEditada] = await db.select().from(transactions).where(eq(transactions.id, umPrevisto.id));
  check("valor real do mês gravado", energiaEditada.amount === 24783, `${energiaEditada.amount}`);
  check("previsto virou realizado", energiaEditada.status === "cleared");
  check(
    "vínculo com a conta fixa preservado",
    energiaEditada.recurringRuleId === regraId,
    "continua sendo aquela parcela; a provisão não a recria",
  );

  // Navegar dispara a provisão — não pode recriar a parcela editada.
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  const doMesmoMes = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.recurringRuleId, regraId!), eq(transactions.date, energiaEditada.date)));
  check(
    "provisão não recria a parcela já editada",
    doMesmoMes.length === 1,
    `${doMesmoMes.length} na mesma data`,
  );

  await page.screenshot({ path: "scripts/editar.png", fullPage: true });
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
