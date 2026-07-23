/**
 * Trava de força bruta no login: após 5 senhas erradas, a conta bloqueia — e a
 * senha CERTA também é recusada durante o bloqueio (senão não protegeria nada).
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-forca-bruta.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, transactions, authAttempts } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `fb-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Cria a conta e sai, para testar o login limpo.
  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "FB Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  await page.context().clearCookies();

  const tentar = async (senha: string) => {
    await page.goto(`${BASE}/entrar`);
    await page.fill("#email", email);
    await page.fill("#password", senha);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(700);
  };

  // ===== 5 senhas erradas =====
  for (let i = 0; i < 5; i++) await tentar("senha-errada-000");

  const tentativas = await db
    .select().from(authAttempts).where(eq(authAttempts.identifier, email));
  check("as tentativas ficam registradas", tentativas.length >= 5, `${tentativas.length}`);
  check("todas marcadas como falha", tentativas.every((t) => !t.sucesso));

  // ===== 6ª tentativa: deve bloquear =====
  await tentar("senha-errada-000");
  check(
    "bloqueia após o limite",
    await page.getByText(/Muitas tentativas/).isVisible(),
  );

  // ===== A senha CERTA também é recusada durante o bloqueio =====
  await tentar(SENHA);
  check(
    "bloqueio vale mesmo com a senha correta",
    await page.getByText(/Muitas tentativas/).isVisible(),
  );
  check("não entrou no app", !page.url().endsWith("/"), page.url());

  // ===== Limpando as tentativas, o login volta a funcionar =====
  await db.delete(authAttempts).where(eq(authAttempts.identifier, email));
  await tentar(SENHA);
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  check("com o contador zerado, entra normalmente", page.url() === BASE + "/");

  await browser.close();
  await db.delete(authAttempts).where(eq(authAttempts.identifier, email));
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
    await db.delete(authAttempts).where(eq(authAttempts.identifier, email));
    await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
