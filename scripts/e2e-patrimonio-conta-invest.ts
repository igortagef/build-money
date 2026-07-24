/**
 * Patrimônio: contas do tipo "investimento" aparecem numa seção própria
 * ("Investimentos em conta") — o clique do card de investimentos do painel leva
 * aqui, mostrando tanto o patrimônio quanto os investimentos por conta.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-patrimonio-conta-invest.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `pc-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "PC Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await db.insert(accounts).values({ ledgerId, name: "XP Invest", type: "investment", currency: "BRL", openingBalance: 50000 });

  await page.goto(`${BASE}/patrimonio`);
  await page.waitForLoadState("networkidle");

  const secao = page.locator("section", { hasText: "Investimentos em conta" });
  check("seção 'Investimentos em conta' aparece", await secao.isVisible());
  check("mostra a conta XP Invest", await secao.getByText("XP Invest").isVisible());
  check("mostra o saldo R$500,00", await secao.getByText(/500,00/).first().isVisible());

  await browser.close();
  await db.delete(accounts).where(eq(accounts.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
