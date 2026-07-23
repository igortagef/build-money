/**
 * Testa a calculadora de juros compostos: cálculo, comparação de cenários,
 * torres de tijolos. Rodar: npx tsx --env-file=.env.local scripts/e2e-calculadora.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `calc-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Calc Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));

  // Chega pela navegação (ícone no menu).
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await page.click('a:has-text("Calculadora")');
  await page.waitForURL("**/calculadora", { timeout: 20000 });
  check("calculadora abre pelo menu", await page.getByText("juros compostos").first().isVisible());

  // Cenário controlado: 0 inicial, 100/mês, 1% a.m., 12 meses → ~1.268.
  await page.fill('input[aria-label="Valor inicial"] >> nth=0', "0,00");
  await page.fill('input[aria-label="Aporte mensal"] >> nth=0', "100,00");
  await page.fill('input[aria-label="Prazo do Cenário A"]', "12");
  await page.fill('input[aria-label="Taxa do Cenário A"]', "1");
  await page.selectOption('select[aria-label="Período da taxa do Cenário A"]', "mes");
  await page.waitForTimeout(400);

  // O total deve ser ~1.268,25 e o investido 1.200.
  check("calcula o total com juros (~1.268)", await page.getByText("R$ 1.268,25").first().isVisible());
  check("mostra o investido (1.200)", await page.getByText("R$ 1.200,00").first().isVisible());

  // Comparação: cenário B com taxa maior rende mais.
  await page.fill('input[aria-label="Valor inicial"] >> nth=1', "0,00");
  await page.fill('input[aria-label="Aporte mensal"] >> nth=1', "100,00");
  await page.fill('input[aria-label="Prazo do Cenário B"]', "12");
  await page.fill('input[aria-label="Taxa do Cenário B"]', "2");
  await page.selectOption('select[aria-label="Período da taxa do Cenário B"]', "mes");
  await page.waitForTimeout(400);

  // As torres de tijolos existem (uma por cenário).
  const torres = await page.locator('[role="img"][aria-label*="Torre com"]').count();
  check("desenha uma torre de tijolos por cenário", torres === 2, `${torres} torres`);

  // Adicionar um terceiro cenário.
  await page.click('button:has-text("Comparar outro cenário")');
  await page.waitForTimeout(300);
  const torres3 = await page.locator('[role="img"][aria-label*="Torre com"]').count();
  check("dá para comparar um terceiro cenário", torres3 === 3, `${torres3}`);

  // Remover um cenário.
  await page.locator('button[aria-label^="Remover"]').last().click();
  await page.waitForTimeout(300);
  const torres2 = await page.locator('[role="img"][aria-label*="Torre com"]').count();
  check("dá para remover um cenário", torres2 === 2, `${torres2}`);

  // Muda para taxa anual e o resultado recalcula.
  await page.selectOption('select[aria-label="Período da taxa do Cenário A"]', "ano");
  await page.fill('input[aria-label="Taxa do Cenário A"]', "12");
  await page.waitForTimeout(400);
  check("recalcula ao trocar para taxa anual", await page.getByText("Comparativo").isVisible());

  await page.screenshot({ path: "scripts/calculadora.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
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
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
