/**
 * Testa o painel gerencial: KPIs, resumos de cada seção (patrimônio,
 * orçamento, metas, rachas), e a ausência da lista de lançamentos.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-dashboard.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, reimbursables, assets } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `dash-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Dash Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Monta um cenário com todas as seções.
  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "5.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // Um lançamento (receita + despesa) para o resultado do mês.
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.click('button:has-text("Receita")');
  await page.fill("#amount", "4.000,00");
  await page.fill("#description", "Salário");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Salário › Salário líquido" });
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  // Um investimento.
  await page.goto(`${BASE}/patrimonio/novo`);
  await page.selectOption("#invKind", "fixed_income");
  await page.fill("#name", "CDB");
  await page.fill("#invested", "10.000,00");
  await page.fill("#current", "10.500,00");
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  // Uma meta.
  await page.goto(`${BASE}/metas/nova`);
  await page.fill("#name", "Viagem");
  await page.fill("#targetAmount", "6.000,00");
  await page.fill("#aporteInicial", "1.500,00");
  await page.click('button:has-text("Criar meta")');
  await page.waitForURL(`${BASE}/metas`, { timeout: 20000 });

  // Um racha em aberto (via aba).
  await page.goto(`${BASE}/lancamentos/novo?aba=racha`);
  await page.waitForLoadState("networkidle");
  await page.fill("#description", "Churrasco");
  await page.fill("#total", "200,00");
  await page.fill("#myShare", "0,00");
  await page.fill('input[aria-label="Valor da pessoa 1"]', "100,00");
  await page.fill('input[aria-label="Valor da pessoa 2"]', "100,00");
  await page.click('button:has-text("Registrar racha")');
  await page.waitForURL(`${BASE}/rachas`, { timeout: 20000 });

  // ===== O painel =====
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");

  // KPIs gerenciais.
  check("KPI de patrimônio líquido", await page.getByText("Patrimônio líquido").isVisible());
  check("KPI de saldo em contas", await page.getByText("Saldo em contas").isVisible());
  check("KPI de resultado do mês", await page.getByText("Resultado do mês").isVisible());
  check("KPI de investimentos", await page.getByText("Investimentos").first().isVisible());

  // Resumos por seção com título clicável.
  // Resumos (layout novo: faixa de título + atalho no rodapé do card).
  check("resumo de Orçamento", await page.getByRole("link", { name: /Ver orçamento/ }).isVisible());
  check("resumo de Metas", await page.getByRole("link", { name: /Ver metas/ }).isVisible());
  check("resumo de Rachas", await page.getByRole("link", { name: /Ver rachas/ }).isVisible());
  // KPIs novos da primeira linha.
  check("KPI de receitas do mês", await page.getByText("Receitas do mês").isVisible());
  check("KPI de despesas do mês", await page.getByText("Despesas do mês").isVisible());
  // Blocos novos de acompanhamento.
  check("bloco 'A conferir'", await page.getByText("A conferir").first().isVisible());
  check("bloco de comparativo", await page.getByText("Comparativo com o mês anterior").isVisible());

  // O racha em aberto aparece no resumo.
  check("resumo de rachas mostra o total a receber", await page.getByText("a receber em 1 racha em aberto").isVisible());
  // A meta aparece no resumo (Viagem, 25%).
  check("resumo de metas mostra a meta", await page.getByText("Viagem").first().isVisible());
  // Rendimento do investimento (+5%).
  check("investimento mostra rendimento", await page.getByText(/\+5%/).first().isVisible());

  // ===== Seletor de mês da análise =====
  check("mostra o seletor de mês (Julho)", await page.getByText(/Julho de 2026/).first().isVisible());
  // Voltar um mês pela seta leva a ?mes=2026-06 (junho, sem lançamentos).
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await page.waitForURL(/mes=2026-06/, { timeout: 15000 });
  await page.getByText(/Junho de 2026/).first().waitFor({ timeout: 15000 });
  check("navega para o mês anterior (Junho)", await page.getByText(/Junho de 2026/).first().isVisible());
  // Botão "Hoje" volta ao mês corrente (URL sem parâmetro de mês).
  check("aparece o atalho para voltar a hoje", await page.getByRole("button", { name: /Hoje/ }).isVisible());
  await page.getByRole("button", { name: /Hoje/ }).click();
  await page.waitForURL((u) => !u.search.includes("mes="), { timeout: 15000 });
  await page.getByText(/Julho de 2026/).first().waitFor({ timeout: 15000 });
  check("volta para Julho pelo atalho Hoje", await page.getByText(/Julho de 2026/).first().isVisible());

  // ===== Engajamento (novo): resumo do dia, sequência e projeção =====
  check("mostra o resumo do dia", await page.getByText("Resumo do dia").isVisible());
  check("mostra a sequência diária (streak)", await page.getByText("Sequência diária").isVisible());
  // A projeção de crescimento saiu do layout padrão (fica disponível no editor),
  // então NÃO deve aparecer sem o usuário ligar.
  check(
    "projeção fica fora do painel padrão",
    !(await page.getByText("Você pode chegar lá").isVisible()),
  );

  // A evolução mensal continua (é gerencial).
  check("mantém o gráfico de evolução", await page.getByText("Evolução mensal").isVisible());
  // Rankings de despesa (gerenciais).
  check("mantém despesas por categoria", await page.getByText("Despesas por categoria").isVisible());

  // ===== O que foi REMOVIDO: a lista operacional de lançamentos =====
  check(
    "removeu a seção 'Últimos lançamentos'",
    !(await page.getByText("Últimos lançamentos").isVisible()),
    "o painel ficou gerencial, não operacional",
  );
  check(
    "não mostra lançamentos individuais",
    !(await page.getByText("Salário").first().isVisible()),
  );

  await page.screenshot({ path: "scripts/dashboard.png", fullPage: true });

  // ===== Menu: barra auto-hide (só ícones, abre no hover) + logo leva ao painel =====
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");

  // Longe do menu: recolhido a uma trilha estreita (só ícones).
  await page.mouse.move(900, 400);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "scripts/dashboard-menu-recolhido.png" });
  const larguraRecolhido = (await page.locator("aside").boundingBox())?.width ?? 0;
  check("por padrão o menu fica estreito (só ícones)", larguraRecolhido < 100, `${larguraRecolhido}px`);

  // Passa o mouse por cima -> expande.
  await page.locator("aside").hover();
  await page.waitForTimeout(450); // deixa a transição de largura terminar
  const larguraExpandido = (await page.locator("aside").boundingBox())?.width ?? 0;
  check("hover no menu expande a barra", larguraExpandido > 200, `${larguraExpandido}px`);

  // Com o menu já aberto (estável), a logo leva ao painel.
  await page.getByRole("link", { name: "Ir para o painel" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 });
  check("clicar na logo volta ao painel", new URL(page.url()).pathname === "/");

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
  await db.delete(assets).where(eq(assets.ledgerId, ledgerId));
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
    await db.delete(assets).where(eq(assets.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
