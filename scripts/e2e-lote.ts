/**
 * Testa lançamento em lote: digitação, colar do Excel, validação e
 * gravação em massa. Rodar: npx tsx --env-file=.env.local scripts/e2e-lote.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, transactionSplits } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `lote-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Lote Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta");
  await page.fill("#openingBalance", "10.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Abre a tela de lote =====
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");
  await page.click('a:has-text("Em lote")');
  await page.waitForURL("**/lote", { timeout: 20000 });

  // ===== Digitação manual de 2 linhas =====
  await page.fill('input[aria-label="Data linha 1"]', "2026-07-05");
  await page.fill('input[aria-label="Descrição linha 1"]', "Padaria");
  await page.selectOption('select[aria-label="Categoria linha 1"]', { label: "Alimentação › Padaria" });
  await page.fill('input[aria-label="Valor linha 1"]', "25,50");

  await page.fill('input[aria-label="Data linha 2"]', "2026-07-06");
  await page.fill('input[aria-label="Descrição linha 2"]', "Uber");
  await page.selectOption('select[aria-label="Categoria linha 2"]', { label: "Transporte › Aplicativos de transporte" });
  await page.fill('input[aria-label="Valor linha 2"]', "18,00");

  check("botão mostra a contagem", await page.getByText("Lançar 2 linhas").isVisible());

  // ===== Colar do Excel (TSV) na linha 3 =====
  // Simula colar: escreve no clipboard e dispara o paste no campo de data.
  const tsv = "10/07/2026\tMercado\t150,00\n11/07/2026\tFarmácia\t42,30\n12/07/2026\tGasolina\t200,00";
  await page.evaluate(async (t) => {
    await navigator.clipboard.writeText(t);
  }, tsv).catch(() => {});

  // Alguns ambientes bloqueiam clipboard; injeta via evento de paste direto.
  await page.locator('input[aria-label="Data linha 3"]').focus();
  await page.evaluate((t) => {
    const el = document.querySelector('input[aria-label="Data linha 3"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, tsv);
  await page.waitForTimeout(500);

  check(
    "colar preencheu a data da linha 3",
    (await page.inputValue('input[aria-label="Data linha 3"]')) === "2026-07-10",
    `data = ${await page.inputValue('input[aria-label="Data linha 3"]')}`,
  );
  check(
    "colar preencheu a descrição",
    (await page.inputValue('input[aria-label="Descrição linha 3"]')) === "Mercado",
  );
  check(
    "colar preencheu o valor",
    (await page.inputValue('input[aria-label="Valor linha 3"]')) === "150,00",
  );
  check(
    "colar criou linhas para o resto (5 no total preenchidas)",
    (await page.inputValue('input[aria-label="Descrição linha 5"]')) === "Gasolina",
    `linha 5 = ${await page.inputValue('input[aria-label="Descrição linha 5"]')}`,
  );
  // As coladas ainda não têm categoria, então o botão conta só as 2 completas.
  check("botão conta só as completas após colar", await page.getByText("Lançar 2 linhas").isVisible());

  // As linhas coladas não têm categoria (não veio no TSV) — precisam ser escolhidas.
  await page.selectOption('select[aria-label="Categoria linha 3"]', { label: "Alimentação › Supermercado" });
  await page.selectOption('select[aria-label="Categoria linha 4"]', { label: "Saúde › Farmácia" });
  await page.selectOption('select[aria-label="Categoria linha 5"]', { label: "Transporte › Combustível" });
  await page.waitForTimeout(200);
  check("com as categorias, o botão conta as 5", await page.getByText("Lançar 5 linhas").isVisible());

  // ===== Salvar o lote =====
  await page.click('button:has-text("Lançar 5 linhas")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const txs = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId)));
  check("gravou os 5 lançamentos de uma vez", txs.length === 5, `${txs.length}`);

  const padaria = txs.find((t) => t.description === "Padaria");
  const gasolina = txs.find((t) => t.description === "Gasolina");
  check("valor digitado correto (25,50)", padaria?.amount === 2550, `${padaria?.amount}`);
  check("valor colado correto (200,00)", gasolina?.amount === 20000, `${gasolina?.amount}`);
  check("data colada correta", gasolina?.date === "2026-07-12", gasolina?.date);
  check("todos como despesa", txs.every((t) => t.type === "expense"));
  check("todos realizados", txs.every((t) => t.status === "cleared"));

  // Cada um tem seu rateio na categoria.
  const splits = await db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, gasolina!.id));
  check("cada lançamento tem rateio", splits.length === 1 && splits[0].amount === 20000);

  // ===== Linha incompleta bloqueia o salvamento =====
  // Uma linha completa (habilita o botão) + uma incompleta (dispara o aviso).
  await page.goto(`${BASE}/lancamentos/lote`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[aria-label="Data linha 1"]', "2026-07-20");
  await page.fill('input[aria-label="Descrição linha 1"]', "Completa");
  await page.selectOption('select[aria-label="Categoria linha 1"]', { label: "Alimentação › Padaria" });
  await page.fill('input[aria-label="Valor linha 1"]', "10,00");

  await page.fill('input[aria-label="Data linha 2"]', "2026-07-21");
  await page.fill('input[aria-label="Descrição linha 2"]', "Sem categoria");
  await page.fill('input[aria-label="Valor linha 2"]', "20,00");
  // Linha 2 sem categoria: incompleta.

  check(
    "botão desabilita quando nada está completo",
    // (sanidade: com uma completa, o botão está habilitado)
    !(await page.locator('button:has-text("Lançar")').isDisabled()),
  );
  await page.click('button:has-text("Lançar")');
  await page.waitForTimeout(1000);
  check(
    "linha incompleta é barrada com aviso",
    await page.getByText(/incompleta/).first().isVisible(),
  );
  const aindaSo5 = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("nada foi gravado enquanto há linha incompleta", aindaSo5.length === 5, `${aindaSo5.length}`);

  await page.screenshot({ path: "scripts/lote.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color") && !e.includes("clipboard"));
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
