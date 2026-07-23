/**
 * Testa a seção de relatórios: filtro de período, tabelas de evolução e
 * rankings, e a exportação em CSV (lançamentos e por categoria).
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-relatorios.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `rel-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Rel Teste");
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

  // Uma receita e uma despesa no mês corrente.
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.click('button:has-text("Receita")');
  await page.fill("#amount", "5.000,00");
  await page.fill("#description", "Salário");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Salário › Salário líquido" });
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "1.200,00");
  await page.fill("#description", "Aluguel");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Aluguel" });
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  // ===== A página de relatórios =====
  await page.goto(`${BASE}/relatorios`);
  await page.waitForLoadState("networkidle");

  check("página abre com o título Relatórios", await page.getByRole("heading", { name: "Relatórios" }).isVisible());
  check("mostra os totais de receita", await page.getByText("R$ 5.000,00").first().isVisible());
  check("mostra a despesa do aluguel", await page.getByText("R$ 1.200,00").first().isVisible());
  check("mostra o resultado do período", await page.getByText("R$ 3.800,00").first().isVisible());
  check("tem o gráfico de evolução", await page.getByText("Evolução mensal").isVisible());
  check("ranking por categoria lista Aluguel", await page.getByText("Aluguel").first().isVisible());
  check("ranking por centro de custo aparece", await page.getByText("Despesas por centro de custo").isVisible());

  // Presets de período.
  await page.getByRole("link", { name: "Este mês" }).click();
  await page.waitForLoadState("networkidle");
  check("preset 'Este mês' filtra sem erro", await page.getByRole("heading", { name: "Relatórios" }).isVisible());

  // ===== Exportação CSV de lançamentos =====
  const dl1 = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("link", { name: /Lançamentos \(CSV\)/ }).click(),
  ]).then(([d]) => d);
  const caminho1 = await dl1.path();
  const csv1 = caminho1 ? require("fs").readFileSync(caminho1, "utf8") : "";
  check("baixa CSV de lançamentos", csv1.length > 0, dl1.suggestedFilename());
  check("CSV tem cabeçalho de lançamentos", csv1.includes("Descrição") && csv1.includes("Valor (base R$)"));
  check("CSV traz o salário", csv1.includes("Salário"));
  check("CSV traz o aluguel negativo", /Aluguel;.*-1200,00/.test(csv1.replace(/\r/g, "")), csv1.split("\n").find((l: string) => l.includes("Aluguel"))?.slice(0, 80) ?? "");
  check("CSV usa BOM UTF-8", csv1.charCodeAt(0) === 0xfeff);

  // ===== Exportação CSV por categoria =====
  const dl2 = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("link", { name: /Por categoria \(CSV\)/ }).click(),
  ]).then(([d]) => d);
  const caminho2 = await dl2.path();
  const csv2 = caminho2 ? require("fs").readFileSync(caminho2, "utf8") : "";
  check("baixa CSV por categoria", csv2.length > 0, dl2.suggestedFilename());
  check("CSV por categoria soma o aluguel", /Aluguel;1200,00/.test(csv2.replace(/\r/g, "")));
  check("CSV por categoria tem total geral", csv2.includes("Total geral;1200,00"));

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
