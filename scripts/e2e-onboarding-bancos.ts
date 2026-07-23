/**
 * Primeiros passos (onboarding) + ícone do banco ao cadastrar conta.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-onboarding-bancos.ts
 */
import { chromium } from "playwright";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `onb-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Onb Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // ===== Painel novo: guia de primeiros passos =====
  await page.waitForLoadState("networkidle");
  check("painel novo mostra 'Primeiros passos'", await page.getByText("Primeiros passos").isVisible());
  check("guia começa em 0 de 4", await page.getByText("0 de 4 concluídos").isVisible());
  check("primeiro passo é cadastrar conta", await page.getByText("Cadastre sua primeira conta").isVisible());

  // ===== Cadastro de conta com banco (ícone por cor + sigla) =====
  await page.goto(`${BASE}/contas/nova`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nubank" }).click();
  check("escolher o banco preenche o nome", (await page.locator("#name").inputValue()) === "Nubank", await page.locator("#name").inputValue());
  await page.fill("#openingBalance", "1.000,00");
  await page.getByRole("button", { name: /Salvar conta/ }).click();
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  check("conta aparece na lista", await page.getByText("Nubank").first().isVisible());
  check("ícone do banco (sigla) aparece", await page.getByText("Nu", { exact: true }).first().isVisible());

  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.name, "Nubank")));
  check("banco gravado no ícone da conta", conta?.icon === "nubank", conta?.icon ?? "null");
  check("cor da marca gravada", conta?.color === "#820AD1", conta?.color ?? "null");

  // ===== Painel: passo da conta agora concluído =====
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("guia avança para 1 de 4", await page.getByText("1 de 4 concluídos").isVisible());

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
