/**
 * Provisão de receitas futuras: variável (pontual) e fixa (recorrente), e sua
 * aparição no fluxo de caixa projetado.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-receitas-previstas.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, recurringRules } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `recp-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

function isoDaqui(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1300 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Rec Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "1.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Receita variável (pontual, daqui a 10 dias) =====
  await page.goto(`${BASE}/receitas-previstas`);
  await page.waitForLoadState("networkidle");
  check("página abre", await page.getByRole("heading", { name: "Receitas previstas" }).isVisible());

  await page.fill("#v-description", "Freela projeto X");
  await page.fill("#v-amount", "2.500,00");
  await page.fill("#v-date", isoDaqui(10));
  await page.click('button:has-text("Provisionar receita")');
  await page.getByRole("status").waitFor({ timeout: 15000 });
  check("confirma provisão variável", await page.getByText("Receita prevista provisionada").isVisible());

  const varDb = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "income"), eq(transactions.status, "pending")));
  check("receita variável é previsto de receita", varDb.length === 1, `${varDb.length}`);
  check("valor correto (250000)", varDb[0]?.amount === 250000, `${varDb[0]?.amount}`);
  check("não é recorrente", varDb[0]?.recurringRuleId === null);

  check("aparece na lista 'A receber'", await page.getByText("Freela projeto X").first().isVisible());

  // ===== Receita fixa (recorrente mensal) =====
  await page.getByRole("button", { name: /^Fixa/ }).click();
  await page.fill("#f-description", "Salário");
  await page.fill("#f-amount", "7.000,00");
  await page.fill("#f-dayOfMonth", "5");
  await page.click('button:has-text("Provisionar receita fixa")');
  await page.getByRole("status").waitFor({ timeout: 15000 });
  check("confirma provisão fixa", await page.getByText("Receita fixa criada e provisionada").isVisible());

  const regras = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.ledgerId, ledgerId), eq(recurringRules.type, "income")));
  check("regra de receita recorrente criada", regras.length === 1, `${regras.length}`);

  // A provisão gerou previstos vinculados à regra.
  const previstoFixa = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.recurringRuleId, regras[0].id)));
  check("provisão gerou previstos da regra", previstoFixa.length >= 1, `${previstoFixa.length}`);

  await page.reload();
  await page.waitForLoadState("networkidle");
  check("salário aparece como recorrente na lista", await page.getByText("Salário").first().isVisible());

  // ===== Aparece no fluxo de caixa projetado =====
  await page.goto(`${BASE}/relatorios/fluxo`);
  await page.waitForLoadState("networkidle");
  check("fluxo mostra entradas previstas", await page.getByText("R$ 2.500,00").first().isVisible());

  // ===== Vive em Lançamentos › Receitas, não na tela direta =====
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");
  check(
    "tela direta de lançamentos NÃO mostra receitas previstas",
    !(await page.getByRole("heading", { name: "Receitas previstas" }).isVisible()),
  );

  await page.goto(`${BASE}/lancamentos?tipo=income`);
  await page.waitForLoadState("networkidle");
  check(
    "aba Receitas mostra a seção 'Receitas previstas'",
    await page.getByRole("heading", { name: "Receitas previstas" }).isVisible(),
  );
  check(
    "aba Receitas lista a receita variável prevista",
    await page.getByText("Freela projeto X").first().isVisible(),
  );
  check(
    "aba Receitas tem atalho para gerenciar",
    await page.getByRole("link", { name: "Gerenciar" }).first().isVisible(),
  );

  // ===== Remover a variável =====
  await page.goto(`${BASE}/receitas-previstas`);
  await page.waitForLoadState("networkidle");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Remover Freela projeto X/ }).click();
  await page.waitForTimeout(1200);
  check("variável removida da lista", !(await page.getByText("Freela projeto X").first().isVisible()));
  const freelaDb = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.description, "Freela projeto X")));
  check("variável removida do banco", freelaDb.length === 0, `${freelaDb.length}`);

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(recurringRules).where(eq(recurringRules.ledgerId, ledgerId));
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
    await db.delete(recurringRules).where(eq(recurringRules.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
