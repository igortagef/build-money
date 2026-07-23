/**
 * Testa os itens de painel: checkbox "pago" na edição, seção de vencidas/a
 * vencer, e a linha de saldo no gráfico.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-painel.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `pnl-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Painel Teste");
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

  const hoje = new Date();
  const ontem = iso(new Date(hoje.getTime() - 86_400_000));
  const daquiA3 = iso(new Date(hoje.getTime() + 3 * 86_400_000));

  // Um previsto VENCIDO (ontem) e um A VENCER (daqui a 3 dias).
  async function criarPrevisto(desc: string, data: string) {
    await page.goto(`${BASE}/lancamentos/novo`);
    await page.fill("#amount", "200,00");
    await page.fill("#description", desc);
    await page.fill("#date", data);
    await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Aluguel" });
    await page.selectOption("#status", "pending");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });
  }
  await criarPrevisto("Conta vencida", ontem);
  await criarPrevisto("Conta a vencer", daquiA3);

  // ===== Seção de vencimentos no painel =====
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("painel mostra seção Vencidas", await page.getByText("Vencidas").first().isVisible());
  check("lista a conta vencida", await page.getByText("Conta vencida").first().isVisible());
  check("painel mostra A vencer", await page.getByText(/A vencer nos próximos dias/).isVisible());
  check("lista a conta a vencer", await page.getByText("Conta a vencer").first().isVisible());

  // ===== Checkbox "pago" na edição dá baixa =====
  const [vencida] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.description, "Conta vencida")));
  await page.goto(`${BASE}/lancamentos/${vencida.id}/editar`);
  await page.waitForLoadState("networkidle");
  check(
    "edição de previsto mostra a caixinha de pago",
    await page.getByText(/Já paguei/).isVisible(),
  );
  check("não mostra o seletor de situação genérico", (await page.locator("#status").count()) === 0);

  await page.getByText(/Já paguei/).click();
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [aposBaixa] = await db.select().from(transactions).where(eq(transactions.id, vencida.id));
  check("checkbox pago deu baixa (previsto -> realizado)", aposBaixa.status === "cleared", aposBaixa.status);

  // Era a única vencida; ao ser paga, o cabeçalho "Vencidas" some do painel.
  // O painel é gerencial: não lista lançamentos, então checo o cabeçalho.
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check(
    "seção Vencidas some quando não há mais pendências vencidas",
    !(await page.getByText("Vencidas").first().isVisible()),
  );

  // ===== Linha de saldo no gráfico =====
  // Cria uma receita e uma despesa realizadas para o gráfico ter dados.
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.click('button:has-text("Receita")');
  await page.fill("#amount", "3.000,00");
  await page.fill("#description", "Salário");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Salário › Salário líquido" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("gráfico tem a legenda de Saldo", await page.getByText("Saldo").first().isVisible());
  // A linha é um <polyline>; confirma que foi desenhada.
  const temLinha = await page.locator("svg polyline").count();
  check("linha de saldo desenhada no gráfico", temLinha >= 1, `${temLinha} polyline`);

  // A tabela do gráfico tem a coluna Saldo.
  await page.getByText("Ver como tabela").first().click();
  await page.waitForTimeout(300);
  check("tabela do gráfico tem coluna Saldo", await page.getByRole("columnheader", { name: "Saldo" }).isVisible());

  await page.screenshot({ path: "scripts/painel-completo.png", fullPage: true });
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
