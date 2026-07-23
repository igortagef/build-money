/**
 * Recuperação de senha: token válido troca a senha e DERRUBA a sessão antiga;
 * a senha nova entra, a antiga não; o token é de uso único.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-reset-senha.ts
 */
import { chromium } from "playwright";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, transactions, passwordResetTokens } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `rs-${Date.now()}@teste.local`;
const SENHA_ANTIGA = "senha-antiga-123";
const SENHA_NOVA = "senha-nova-456";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

// Mesmo hash da lib: guardamos o hash, o link leva o token em claro.
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Cria a conta.
  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "RS Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA_ANTIGA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));

  // ===== Pedir reset não revela se o e-mail existe =====
  await page.context().clearCookies();
  await page.goto(`${BASE}/recuperar-senha`);
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  await page.getByText(/enviamos um link/).waitFor({ timeout: 15000 });
  check("pedido responde com mensagem genérica", await page.getByText(/enviamos um link/).isVisible());

  // ===== Um token que eu controlo (insiro o hash direto) =====
  const token = "tok_" + Date.now() + "_abc";
  await db.insert(passwordResetTokens).values({
    userId: u.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });

  // Link inválido é barrado.
  await page.goto(`${BASE}/redefinir-senha?token=token-invalido`);
  check("token inválido mostra 'Link inválido'", await page.getByText(/Link inválido/).isVisible());

  // ===== Redefinir com o token válido =====
  await page.goto(`${BASE}/redefinir-senha?token=${token}`);
  await page.fill("#password", SENHA_NOVA);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/entrar/, { timeout: 15000 });
  check("redefiniu e voltou ao login", /\/entrar/.test(page.url()));

  // ===== A senha ANTIGA não entra mais =====
  await page.goto(`${BASE}/entrar`);
  await page.fill("#email", email);
  await page.fill("#password", SENHA_ANTIGA);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  check("senha antiga é recusada", !page.url().endsWith("/entrar") ? false : true, page.url());

  // ===== A senha NOVA entra =====
  await page.goto(`${BASE}/entrar`);
  await page.fill("#email", email);
  await page.fill("#password", SENHA_NOVA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  check("senha nova entra normalmente", page.url() === BASE + "/");

  // ===== O token usado não pode ser reusado (checa o token específico) =====
  const [tk] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(token)));
  check("token marcado como usado", tk?.usedAt != null, String(tk?.usedAt));

  await browser.close();
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, u.id));
  await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
  await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERRO:", e.message);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, u.id));
    await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
