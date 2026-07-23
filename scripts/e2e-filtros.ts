/**
 * Testa os filtros de conta, categoria e centro de custo.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-filtros.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `flt-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

/** Clica e espera a navegação do roteador concluir de fato. */
async function clicarFiltro(page: any, seletor: string) {
  const antes = page.url();
  await page.click(seletor);
  await page.waitForFunction((u: string) => location.href !== u, antes, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

/**
 * Abre o menu de um filtro só se ele estiver fechado.
 *
 * O menu permanece aberto depois de marcar uma opção — de propósito, porque a
 * seleção é múltipla. Clicar no botão de novo o fecharia.
 */
async function abrirMenu(page: any, nome: string) {
  const botao = page.locator(`button:has-text("${nome}")`).first();
  if ((await botao.getAttribute("aria-expanded")) !== "true") {
    await botao.click();
    await page.waitForTimeout(200);
  }
}

async function lancar(page: any, valor: string, desc: string, cat: string, conta?: string) {
  await page.goto(`${BASE}/lancamentos/novo`);
  if (conta) await page.selectOption("#accountId", { label: conta });
  await page.fill("#amount", valor);
  await page.fill("#description", desc);
  await page.selectOption('select[aria-label="Categoria 1"]', { label: cat });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Filtro Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  for (const nome of ["Conta A", "Conta B"]) {
    await page.goto(`${BASE}/contas/nova`);
    await page.fill("#name", nome);
    await page.fill("#openingBalance", "10.000,00");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });
  }

  await lancar(page, "100,00", "Mercado na A", "Alimentação › Supermercado", "Conta A");
  await lancar(page, "200,00", "Aluguel na B", "Moradia › Aluguel", "Conta B");
  await lancar(page, "50,00", "Bar na A", "Lazer › Bares", "Conta A");

  // Rateado: cai em duas categorias e dois centros de custo.
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.selectOption("#accountId", { label: "Conta A" });
  await page.fill("#amount", "300,00");
  await page.fill("#description", "Rateado A");
  await page.click('button:has-text("Ratear")');
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.fill('input[aria-label="Valor do rateio 1"]', "200,00");
  await page.selectOption('select[aria-label="Categoria 2"]', { label: "Moradia › Aluguel" });
  await page.fill('input[aria-label="Valor do rateio 2"]', "100,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");
  check("sem filtro, mostra os 4 lançamentos", (await page.getByText(/na A|na B|Rateado A/).count()) === 4);

  // ===== Filtro por conta =====
  await abrirMenu(page, "Conta");
  await clicarFiltro(page, '[role="menuitemcheckbox"]:has-text("Conta B")');
  await page.waitForLoadState("networkidle");
  check("filtro por conta mostra só a conta escolhida", await page.getByText("Aluguel na B").isVisible());
  check("e esconde as outras", !(await page.getByText("Mercado na A").isVisible()));
  check("contador aparece no botão", await page.getByText("Conta").first().isVisible());
  check("URL guarda o filtro", page.url().includes("conta="), page.url());

  await clicarFiltro(page, 'button:has-text("Limpar")');
  check("limpar remove o filtro", await page.getByText("Mercado na A").isVisible());

  // ===== Filtro por categoria, com rateio =====
  await abrirMenu(page, "Categoria");
  await clicarFiltro(page, '[role="menuitemcheckbox"]:has-text("Lazer › Bares")');
  await page.waitForLoadState("networkidle");
  check("filtro por categoria funciona", await page.getByText("Bar na A").isVisible());
  check("esconde o que não tem a categoria", !(await page.getByText("Aluguel na B").isVisible()));

  await clicarFiltro(page, 'button:has-text("Limpar")');

  // O ponto delicado: filtrar por Supermercado deve trazer o rateado INTEIRO,
  // ainda mostrando que ele tem 2 categorias.
  await abrirMenu(page, "Categoria");
  await clicarFiltro(page, '[role="menuitemcheckbox"]:has-text("Alimentação › Supermercado")');
  await page.waitForLoadState("networkidle");
  check("rateado aparece ao filtrar por uma de suas categorias", await page.getByText("Rateado A").isVisible());
  check(
    "e continua mostrando as 2 categorias dele",
    await page.getByText("2 categorias").isVisible(),
    "filtrar não pode mutilar o lançamento",
  );

  await clicarFiltro(page, 'button:has-text("Limpar")');

  // ===== Filtro por centro de custo =====
  await abrirMenu(page, "Centro de custo");
  await clicarFiltro(page, '[role="menuitemcheckbox"]:has-text("Moradia")');
  await page.waitForLoadState("networkidle");
  check("filtro por centro de custo funciona", await page.getByText("Aluguel na B").isVisible());
  check("e traz o rateado que toca esse centro", await page.getByText("Rateado A").isVisible());
  check("esconde os que não tocam", !(await page.getByText("Bar na A").isVisible()));

  // ===== Combinar filtros =====
  await abrirMenu(page, "Conta");
  await clicarFiltro(page, '[role="menuitemcheckbox"]:has-text("Conta A")');
  await page.waitForLoadState("networkidle");
  check(
    "combina conta + centro de custo",
    (await page.getByText("Rateado A").isVisible()) &&
      !(await page.getByText("Aluguel na B").isVisible()),
    "Moradia na Conta A = só o rateado",
  );

  // ===== Filtros sobrevivem à troca de mês =====
  // O <Link> do Next também navega pelo cliente: esperar "load" não serve.
  await clicarFiltro(page, 'a:has-text("Anterior")');
  check(
    "filtros sobrevivem à navegação de mês",
    page.url().includes("conta=") && page.url().includes("centro="),
    page.url(),
  );
  check(
    "mês vazio com filtro explica o motivo",
    await page.getByText(/com os filtros aplicados/).isVisible(),
  );

  // ===== Busca dentro do filtro =====
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");
  await abrirMenu(page, "Categoria");

  const campoBusca = page.locator('input[aria-label="Buscar categoria"]');
  check("filtro de categoria tem busca (são 100+)", await campoBusca.isVisible());

  const antesDaBusca = await page.locator('[role="menuitemcheckbox"]').count();
  await campoBusca.fill("supermerc");
  await page.waitForTimeout(300);
  const depoisDaBusca = await page.locator('[role="menuitemcheckbox"]').count();
  check(
    "busca reduz a lista",
    depoisDaBusca < antesDaBusca && depoisDaBusca > 0,
    `${antesDaBusca} -> ${depoisDaBusca}`,
  );

  // Ninguém digita acento com pressa: buscar "agua" tem que achar "Água".
  await campoBusca.fill("agua");
  await page.waitForTimeout(300);
  const comAcento = await page.locator('[role="menuitemcheckbox"]').allTextContents();
  check(
    "busca sem acento acha resultado com acento",
    comAcento.some((t: string) => t.includes("Água")),
    comAcento.join(" | ") || "nada encontrado",
  );

  // E maiúscula/minúscula não pode importar.
  await campoBusca.fill("ALUGUEL");
  await page.waitForTimeout(300);
  const caixaAlta = await page.locator('[role="menuitemcheckbox"]').allTextContents();
  check(
    "busca ignora maiúsculas",
    caixaAlta.some((t: string) => t.includes("Aluguel")),
    caixaAlta.join(" | ") || "nada encontrado",
  );

  await campoBusca.fill("zzzznaoexiste");
  await page.waitForTimeout(300);
  check(
    "busca sem resultado explica",
    await page.getByText(/Nada encontrado para/).isVisible(),
  );

  // Selecionar pela busca precisa funcionar.
  await campoBusca.fill("Bares");
  await page.waitForTimeout(300);
  await clicarFiltro(page, '[role="menuitemcheckbox"]:has-text("Bares")');
  check("dá para selecionar um resultado da busca", page.url().includes("categoria="));

  // O filtro de conta tem poucas opções: busca ali seria ruído.
  await abrirMenu(page, "Conta");
  check(
    "filtro com poucas opções não mostra busca",
    (await page.locator('input[aria-label="Buscar conta"]').count()) === 0,
  );

  await page.screenshot({ path: "scripts/filtros.png", fullPage: true });
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
