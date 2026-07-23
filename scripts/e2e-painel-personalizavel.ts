/**
 * Painel personalizável: a pessoa escolhe os blocos que aparecem.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-painel-personalizavel.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `pers-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Pers Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Conta + uma receita, para o painel ter dados (não cair no estado vazio).
  const [conta] = await db
    .insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 100000 })
    .returning({ id: accounts.id });
  await db.insert(transactions).values({
    ledgerId,
    accountId: conta.id,
    type: "income",
    status: "cleared",
    amount: 50000,
    currency: "BRL",
    amountBase: 50000,
    description: "Salário",
    date: "2026-07-05",
  });

  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check("painel mostra a evolução mensal por padrão", await page.getByText("Evolução mensal").isVisible());
  check("painel mostra o KPI de investimentos por padrão", await page.getByText("Investimentos").first().isVisible());

  // ===== Personalizar: esconde Evolução mensal e Investimentos =====
  await page.getByRole("button", { name: /Personalizar/ }).click();
  await page.getByRole("heading", { name: "Personalizar painel" }).waitFor({ timeout: 10000 });
  await page.getByRole("checkbox", { name: "Evolução mensal" }).uncheck();
  await page.getByRole("checkbox", { name: "Investimentos" }).uncheck();
  await page.getByRole("button", { name: "Salvar" }).click();
  // Espera o modal fechar e o painel refletir (o refresh do RSC leva um instante).
  await page.getByRole("heading", { name: "Personalizar painel" }).waitFor({ state: "detached", timeout: 10000 });

  const sumiu = async (loc: ReturnType<typeof page.getByRole>) => {
    try {
      await loc.waitFor({ state: "detached", timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  };
  check("evolução mensal some do painel", await sumiu(page.getByRole("heading", { name: "Evolução mensal" })));
  check("KPI de investimentos some do painel", await sumiu(page.getByText("Investimentos", { exact: true })));
  // Um bloco não escondido continua.
  check("resultado do mês continua visível", await page.getByText("Resultado do mês").isVisible());

  const [uDb] = await db.select().from(users).where(eq(users.id, u.id));
  const escondidos = uDb.dashboardHidden ?? [];
  check(
    "preferência gravada no banco",
    escondidos.includes("evolucao") && escondidos.includes("kpi-investimentos"),
    JSON.stringify(escondidos),
  );

  // ===== Restaurar: "Mostrar tudo" traz de volta =====
  await page.getByRole("button", { name: /Personalizar/ }).click();
  await page.getByRole("heading", { name: "Personalizar painel" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Mostrar tudo" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("heading", { name: "Personalizar painel" }).waitFor({ state: "detached", timeout: 10000 });
  let voltou = true;
  try {
    await page.getByRole("heading", { name: "Evolução mensal" }).waitFor({ state: "visible", timeout: 10000 });
  } catch {
    voltou = false;
  }
  check("mostrar tudo traz a evolução de volta", voltou);

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
