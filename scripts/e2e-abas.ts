/**
 * Testa as abas de novo lançamento: lançamento, transferência e racha num só
 * lugar. Rodar: npx tsx --env-file=.env.local scripts/e2e-abas.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, reimbursables } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `abas-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Abas Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  for (const [nome, saldo] of [["Corrente", "5.000,00"], ["Poupança", "0,00"]] as const) {
    await page.goto(`${BASE}/contas/nova`);
    await page.fill("#name", nome);
    if (nome === "Poupança") await page.selectOption("#type", "savings");
    await page.fill("#openingBalance", saldo);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });
  }

  // ===== As três abas existem no novo lançamento =====
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.waitForLoadState("networkidle");
  check("aba Lançamento existe", await page.getByRole("tab", { name: /Lançamento/ }).isVisible());
  check("aba Transferência existe", await page.getByRole("tab", { name: /Transferência/ }).isVisible());
  check("aba Racha existe", await page.getByRole("tab", { name: /Racha/ }).isVisible());

  // ===== Lançamento normal na aba padrão =====
  check("aba Lançamento vem selecionada", await page.locator('[role="tab"][aria-selected="true"]').getByText("Lançamento").isVisible());
  await page.fill("#amount", "50,00");
  await page.fill("#description", "Café");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Café e lanches" });
  await page.click('button:has-text("Salvar lançamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });
  const desp = await db.select().from(transactions).where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "expense")));
  check("lançamento pela aba funciona", desp.length === 1);

  // ===== Transferência pela aba =====
  await page.goto(`${BASE}/lancamentos/novo?aba=transferencia`);
  await page.waitForLoadState("networkidle");
  check("URL abre direto na aba de transferência", await page.locator("#from").isVisible());
  await page.selectOption("#from", { label: "Corrente" });
  await page.selectOption("#to", { label: "Poupança" });
  await page.fill("#amount", "1.000,00");
  await page.click('button:has-text("Transferir")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });
  const transf = await db.select().from(transactions).where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "transfer")));
  check("transferência pela aba cria as 2 pernas", transf.length === 2, `${transf.length}`);

  // ===== Racha pela aba =====
  await page.goto(`${BASE}/lancamentos/novo?aba=racha`);
  await page.waitForLoadState("networkidle");
  check("URL abre direto na aba de racha", await page.locator("#total").isVisible());
  await page.fill("#description", "Pizza");
  await page.fill("#total", "120,00");
  await page.fill("#myShare", "40,00");
  await page.selectOption("#categoryId", { label: "Alimentação › Delivery" });
  await page.fill('input[aria-label="Valor da pessoa 1"]', "40,00");
  await page.fill('input[aria-label="Valor da pessoa 2"]', "40,00");
  await page.click('button:has-text("Registrar racha")');
  await page.waitForURL(`${BASE}/rachas`, { timeout: 20000 });
  const rachas = await db.select().from(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
  check("racha pela aba é criado", rachas.length === 1, `${rachas.length}`);

  // ===== Trocar de aba pelo clique =====
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: /Transferência/ }).click();
  await page.waitForTimeout(300);
  check("clicar na aba mostra o form de transferência", await page.locator("#from").isVisible());
  await page.getByRole("tab", { name: /Racha/ }).click();
  await page.waitForTimeout(300);
  check("clicar em Racha mostra o form de racha", await page.getByText("Quem vai reembolsar").isVisible());

  await page.screenshot({ path: "scripts/abas.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(reimbursables).where(eq(reimbursables.ledgerId, ledgerId));
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
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
