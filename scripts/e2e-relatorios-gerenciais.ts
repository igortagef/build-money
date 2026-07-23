/**
 * Relatórios gerenciais: DRE, balanço patrimonial e fluxo de caixa
 * projetado. Rodar: npx tsx --env-file=.env.local scripts/e2e-relatorios-gerenciais.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, assets, assetKinds } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `relg-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Rel Ger");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "2.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // Receita e despesa realizadas (para a DRE).
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.click('button:has-text("Receita")');
  await page.fill("#amount", "6.000,00");
  await page.fill("#description", "Salário");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Salário › Salário líquido" });
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "1.500,00");
  await page.fill("#description", "Aluguel");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Aluguel" });
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  // Uma despesa PREVISTA no futuro (para o fluxo projetado).
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "800,00");
  await page.fill("#description", "Fatura futura");
  const proxMes = new Date();
  proxMes.setMonth(proxMes.getMonth() + 1);
  await page.fill("#date", proxMes.toISOString().slice(0, 10));
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Aluguel" });
  await page.selectOption("#status", "pending");
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  // Um investimento (para o balanço).
  await page.goto(`${BASE}/patrimonio/novo`);
  await page.selectOption("#invKind", "fixed_income");
  await page.fill("#name", "CDB");
  await page.fill("#invested", "10.000,00");
  await page.fill("#current", "10.000,00");
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  // ===== DRE =====
  await page.goto(`${BASE}/relatorios/dre`);
  await page.waitForLoadState("networkidle");
  check("DRE abre", await page.getByRole("heading", { name: "DRE" }).isVisible());
  check("DRE mostra total de receitas", await page.getByText("Total de receitas").isVisible());
  check("DRE mostra o salário", await page.getByText("R$ 6.000,00").first().isVisible());
  check("DRE mostra despesa do aluguel", await page.getByText("R$ 1.500,00").first().isVisible());
  // Resultado do mês = 6.000 - 1.500 = 4.500 (o previsto não entra).
  check("DRE mostra resultado (superávit)", await page.getByText(/Resultado \(superávit\)/).isVisible());
  check("DRE resultado é 4.500", await page.getByText("R$ 4.500,00").first().isVisible());

  // ===== Balanço patrimonial =====
  await page.goto(`${BASE}/relatorios/balanco`);
  await page.waitForLoadState("networkidle");
  check("Balanço abre", await page.getByRole("heading", { name: "Balanço patrimonial" }).isVisible());
  check("Balanço mostra ativos", await page.getByText("Ativos").first().isVisible());
  check("Balanço mostra passivos", await page.getByText("Passivos").first().isVisible());
  check("Balanço mostra investimentos", await page.getByText("Investimentos").first().isVisible());
  check("Balanço mostra patrimônio líquido", await page.getByText("Patrimônio líquido").first().isVisible());
  // Caixa: 2.000 + 6.000 - 1.500 = 6.500. Ativos = 6.500 + 10.000 (CDB) = 16.500.
  check("Balanço soma o patrimônio líquido", await page.getByText("R$ 16.500,00").first().isVisible());

  // ===== Fluxo de caixa projetado =====
  await page.goto(`${BASE}/relatorios/fluxo`);
  await page.waitForLoadState("networkidle");
  check("Fluxo abre", await page.getByRole("heading", { name: "Fluxo de caixa projetado" }).isVisible());
  check("Fluxo mostra saldo de caixa hoje", await page.getByText("Saldo de caixa hoje").isVisible());
  // Saldo hoje = 6.500 (só contas de dinheiro).
  check("Fluxo parte de 6.500", await page.getByText("R$ 6.500,00").first().isVisible());
  check("Fluxo mostra a saída prevista de 800", await page.getByText("R$ 800,00").first().isVisible());
  check("Fluxo tem o gráfico de saldo projetado", await page.getByText("Saldo projetado").first().isVisible());

  // ===== Relatórios no menu lateral (não só na seção) =====
  const aside = page.locator("aside");
  check("menu lista DRE", await aside.getByRole("link", { name: "DRE" }).isVisible());
  check("menu lista Fluxo projetado", await aside.getByRole("link", { name: "Fluxo projetado" }).isVisible());
  check("menu lista Balanço", await aside.getByRole("link", { name: "Balanço" }).isVisible());
  // O menu é auto-hide: expande no hover. Estabiliza antes de clicar, senão o
  // clique cai durante a animação de largura.
  await aside.hover();
  await page.waitForTimeout(450);
  await aside.getByRole("link", { name: "Balanço" }).click();
  await page.waitForURL(`${BASE}/relatorios/balanco`, { timeout: 20000 });
  check("menu navega ao Balanço", await page.getByRole("heading", { name: "Balanço patrimonial" }).isVisible());

  // ===== Navegação entre relatórios (sub-nav) =====
  await page.getByRole("link", { name: "Resumo" }).first().click();
  await page.waitForURL(`${BASE}/relatorios`, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  check("nav volta ao Resumo", await page.getByRole("heading", { name: "Relatórios" }).isVisible());

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(assets).where(eq(assets.ledgerId, ledgerId));
  await db.delete(assetKinds).where(eq(assetKinds.ledgerId, ledgerId));
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
    await db.delete(assets).where(eq(assets.ledgerId, u.defaultLedgerId!));
    await db.delete(assetKinds).where(eq(assetKinds.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
