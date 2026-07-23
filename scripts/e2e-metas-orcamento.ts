/**
 * Testa metas (progresso, projeção, conquistas) e orçamento (limite, estouro,
 * herança entre meses). Rodar com o dev no ar:
 *   npx tsx --env-file=.env.local scripts/e2e-metas-orcamento.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users,
  ledgers,
  transactions,
  goals,
  goalContributions,
  budgets,
  userAchievements,
} from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `mo-${Date.now()}@teste.local`;
const senha = "senha-de-teste-123";

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
  await page.fill("#name", "Meta Teste");
  await page.fill("#email", email);
  await page.fill("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta");
  await page.fill("#openingBalance", "20.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ================= METAS =================
  await page.goto(`${BASE}/metas`);
  check("metas mostra estado vazio", await page.getByText("Nenhuma meta ainda").isVisible());

  await page.goto(`${BASE}/metas/nova`);
  await page.fill("#name", "Reserva de emergência");
  await page.fill("#targetAmount", "12.000,00");
  await page.fill("#aporteInicial", "3.000,00");
  // Data alvo daqui a ~6 meses.
  const alvo = new Date();
  alvo.setMonth(alvo.getMonth() + 6);
  const alvoISO = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-15`;
  await page.fill("#targetDate", alvoISO);
  await page.waitForTimeout(300);

  // Faltam 9.000 em 6 meses = 1.500/mês. A prévia precisa dizer isso ANTES
  // de criar — é o número que decide se a meta é realista.
  check(
    "prévia calcula quanto guardar por mês",
    await page.getByText("R$ 1.500,00").first().isVisible(),
    "9.000 restantes / 6 meses",
  );

  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/metas`, { timeout: 20000 });

  check("meta aparece na lista", await page.getByText("Reserva de emergência").first().isVisible());
  check("progresso mostra 25%", await page.getByText("25%").first().isVisible(), "3.000 de 12.000");
  check(
    "mostra o quanto falta",
    await page.getByText("faltam R$ 9.000,00").first().isVisible(),
  );

  const conq1 = await db.select().from(userAchievements).where(eq(userAchievements.userId, u.id));
  check("conquista 'alvo definido' desbloqueou", conq1.map((c) => c.code).includes("primeira_meta"));

  // --- Aporte ---
  await page.fill('input[aria-label*="Guardar"], input[id^="aporte-"]', "2.000,00");
  await page.click('button:has-text("Guardar")');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });

  const aportes = await db.select().from(goalContributions);
  check("aporte foi gravado", aportes.length === 2, `${aportes.length} aportes`);
  const total = aportes.reduce((s, a) => s + a.amount, 0);
  check("total guardado = 5.000,00", total === 500000, `${total} centavos`);
  // 5.000 de 12.000 = 41,67%, que arredonda para 42%.
  check("progresso subiu para 42%", await page.getByText("42%").first().isVisible());

  // --- Atingir a meta ---
  await page.fill('input[id^="aporte-"]', "7.000,00");
  await page.click('button:has-text("Guardar")');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });

  const [metaDb] = await db.select().from(goals).where(eq(goals.ledgerId, ledgerId));
  check("meta marcada como atingida no banco", metaDb.status === "achieved", metaDb.status);
  check("tela mostra 'Meta atingida'", await page.getByText("Meta atingida").first().isVisible());
  check("aparece na seção Concluídas", await page.getByText("Concluídas").isVisible());

  const conq2 = await db.select().from(userAchievements).where(eq(userAchievements.userId, u.id));
  check(
    "conquista 'missão cumprida' desbloqueou",
    conq2.map((c) => c.code).includes("meta_atingida"),
  );
  await page.screenshot({ path: "scripts/metas.png", fullPage: true });

  // ================= ORÇAMENTO =================
  await page.goto(`${BASE}/orcamento`);
  check("orçamento mostra estado vazio", await page.getByText("Nenhum limite definido").isVisible());

  // As categorias sem limite ficam agrupadas e recolhidas — são 70+.
  await page.locator("summary", { hasText: "Alimentação" }).first().click();
  check(
    "grupos vêm recolhidos e abrem ao clicar",
    await page
      .locator('input[aria-label="Limite mensal de Alimentação › Supermercado"]')
      .isVisible(),
  );

  // Define limite de 1.000 em Supermercado
  const campo = page.locator('input[aria-label="Limite mensal de Alimentação › Supermercado"]');
  await campo.fill("1.000,00");
  await campo.blur();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });

  const orcs = await db.select().from(budgets).where(eq(budgets.ledgerId, ledgerId));
  check("orçamento gravado no banco", orcs.length === 1, `${orcs.length}`);
  check("valor em centavos", orcs[0]?.amount === 100000, `${orcs[0]?.amount}`);
  check("marcado para repetir nos meses seguintes", orcs[0]?.rollsOver === true);
  check("categoria migrou para 'Com limite'", await page.getByText("Com limite").isVisible());

  // Gasta 800 -> 80%, deve virar aviso
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "800,00");
  await page.fill("#description", "Mercado");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/orcamento`);
  await page.waitForLoadState("networkidle");
  check("orçamento mostra o gasto", await page.getByText("R$ 800,00").first().isVisible());
  check("mostra o que resta", await page.getByText("restam R$ 200,00").first().isVisible());

  // Estoura: mais 500 -> 1.300 de 1.000
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "500,00");
  await page.fill("#description", "Mercado 2");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/orcamento`);
  await page.waitForLoadState("networkidle");
  check(
    "estouro é sinalizado com o valor excedido",
    await page.getByText("R$ 300,00 acima").first().isVisible(),
    "1.300 gastos de 1.000",
  );

  // Gasto fora do orçamento precisa ser avisado
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "450,00");
  await page.fill("#description", "Fora do orçamento");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Moradia › Aluguel" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/orcamento`);
  await page.waitForLoadState("networkidle");
  check(
    "avisa sobre gasto em categoria sem limite",
    await page.getByText(/categorias sem limite definido/).isVisible(),
    "senão o usuário acha que está tudo controlado",
  );
  await page.screenshot({ path: "scripts/orcamento.png", fullPage: true });

  // --- Herança: o limite vale no mês seguinte sem redigitar ---
  const prox = new Date();
  prox.setMonth(prox.getMonth() + 1);
  const proxISO = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}`;
  await page.goto(`${BASE}/orcamento?mes=${proxISO}`);
  await page.waitForLoadState("networkidle");
  // No mês seguinte a categoria já tem limite herdado, então está em "Com
  // limite" — visível sem precisar abrir grupo.
  const campoProx = page.locator('input[aria-label="Limite mensal de Alimentação › Supermercado"]');
  check(
    "limite se repete no mês seguinte",
    (await campoProx.inputValue()) === "1.000,00",
    `campo tem "${await campoProx.inputValue()}"`,
  );
  check(
    "e é marcado como repetido",
    await page.getByText("repetido").first().isVisible(),
  );

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
