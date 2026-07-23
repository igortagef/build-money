/**
 * Testa o lançamento com rateio no navegador, contra o banco de verdade.
 * Rodar com o dev no ar:
 *   npx tsx --env-file=.env.local scripts/e2e-rateio.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, transactionSplits } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `rateio-${Date.now()}@teste.local`;
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

  // Cadastro + conta
  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Rateio Teste");
  await page.fill("#email", email);
  await page.fill("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta Teste");
  await page.fill("#openingBalance", "10.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // --- Lançamento simples, categoria única ---
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "189,05");
  await page.fill("#description", "Energia elétrica");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Energia elétrica" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });
  check(
    "lançamento simples aparece na lista",
    await page.getByText("Energia elétrica").first().isVisible(),
  );
  check(
    "valor formatado com sinal de despesa",
    await page.getByText("− R$ 189,05").first().isVisible(),
  );

  // --- Lançamento com rateio ---
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "300,00");
  await page.fill("#description", "Compras do mês");
  await page.click('button:has-text("Ratear")');

  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.fill('input[aria-label="Valor do rateio 1"]', "200,00");
  await page.selectOption('select[aria-label="Categoria 2"]', { label: "Cuidados pessoais › Cosméticos" });
  await page.fill('input[aria-label="Valor do rateio 2"]', "50,00");

  // Ainda faltam 50: o placar precisa avisar ANTES de salvar.
  check(
    "placar avisa que falta distribuir",
    await page.getByText("Falta distribuir").isVisible(),
  );
  check(
    "placar mostra a diferença exata",
    await page.getByText("R$ 50,00").first().isVisible(),
  );

  // O botão "ajustar" deve fechar a conta sozinho.
  await page.click('button:has-text("ajustar")');
  await page.waitForTimeout(300);
  check(
    "botão ajustar fecha o rateio",
    await page.getByText("Rateio fecha com o valor").isVisible(),
  );
  check(
    "ajuste foi para a última linha",
    (await page.inputValue('input[aria-label="Valor do rateio 2"]')) === "100,00",
    `linha 2 = ${await page.inputValue('input[aria-label="Valor do rateio 2"]')}`,
  );

  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });
  check(
    "lançamento rateado aparece",
    await page.getByText("Compras do mês").first().isVisible(),
  );
  check(
    "lista marca que tem 2 categorias",
    await page.getByText("2 categorias").first().isVisible(),
  );

  // --- O rateio bate no BANCO, não só na tela ---
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ledgerId, u.defaultLedgerId!));
  const rateada = txs.find((t) => t.description === "Compras do mês")!;
  const splits = await db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, rateada.id));

  check("gravou 2 rateios no banco", splits.length === 2, `${splits.length}`);
  check(
    "soma dos rateios = total do lançamento",
    splits.reduce((s, x) => s + x.amount, 0) === rateada.amount,
    `${splits.reduce((s, x) => s + x.amount, 0)} vs ${rateada.amount}`,
  );
  check("total gravado em centavos", rateada.amount === 30000, `${rateada.amount}`);

  // --- Dividir igualmente não pode perder centavo ---
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "100,00");
  await page.fill("#description", "Divisão em 3");
  await page.click('button:has-text("Ratear")');
  await page.click('button:has-text("Adicionar categoria")');
  await page.click('button:has-text("Dividir igualmente")');
  await page.waitForTimeout(300);
  const v1 = await page.inputValue('input[aria-label="Valor do rateio 1"]');
  const v2 = await page.inputValue('input[aria-label="Valor do rateio 2"]');
  const v3 = await page.inputValue('input[aria-label="Valor do rateio 3"]');
  check(
    "R$ 100,00 em 3 fecha sem perder centavo",
    v1 === "33,34" && v2 === "33,33" && v3 === "33,33",
    `${v1} + ${v2} + ${v3}`,
  );
  check(
    "e o placar confirma que fechou",
    await page.getByText("Rateio fecha com o valor").isVisible(),
  );

  // --- Trocar para receita deve limpar categorias de despesa ---
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Aluguel" });
  await page.click('button:has-text("Receita")');
  await page.waitForTimeout(200);
  check(
    "trocar para receita limpa a categoria de despesa",
    (await page.inputValue('select[aria-label="Categoria 1"]')) === "",
  );
  const opcoes = await page.locator('select[aria-label="Categoria 1"] option').allTextContents();
  check(
    "e passa a oferecer só categorias de receita",
    opcoes.some((o) => o.includes("Salário")) &&
      !opcoes.some((o) => o === "Moradia › Aluguel"),
  );

  // --- Painel com os gráficos ---
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("painel mostra evolução mensal", await page.getByText("Evolução mensal").isVisible());
  check(
    "painel mostra despesas por categoria",
    await page.getByText("Despesas por categoria").isVisible(),
  );
  check(
    "ranking traz a categoria rateada",
    await page.getByText("Supermercado").first().isVisible(),
  );
  check(
    "centro de custo totaliza o grupo",
    await page.getByText("Alimentação").first().isVisible(),
  );
  await page.screenshot({ path: "scripts/painel-cheio.png", fullPage: true });

  check("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));

  await browser.close();

  await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
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
