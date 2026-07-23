/**
 * Portabilidade (LGPD): exportar todos os dados em JSON e excluir a conta com
 * dupla confirmação (senha + "EXCLUIR"), apagando tudo.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-meus-dados.ts
 */
import { chromium } from "playwright";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions, transactionSplits, categories } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `md-${Date.now()}@teste.local`;
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
  await page.fill("#name", "MD Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Algum dado para a exportação conter.
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))).limit(1);
  const [conta] = await db.insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 100000 })
    .returning({ id: accounts.id });
  const [tx] = await db.insert(transactions)
    .values({ ledgerId, accountId: conta.id, type: "expense", status: "cleared", amount: 4200, currency: "BRL", amountBase: 4200, description: "Café teste exportação", date: "2026-07-05" })
    .returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: tx.id, categoryId: cat.id, amount: 4200, amountBase: 4200, sortOrder: 0 });

  // ===== Exportação =====
  await page.goto(`${BASE}/conta`);
  await page.waitForLoadState("networkidle");
  const dl = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("link", { name: /Baixar meus dados/ }).click(),
  ]).then(([d]) => d);
  const caminho = await dl.path();
  const conteudo = caminho ? (await import("fs")).readFileSync(caminho, "utf8") : "";
  const json = JSON.parse(conteudo);
  check("exporta o perfil", json.perfil?.email === email);
  check("exporta a conta cadastrada", json.contas?.some((c: { name: string }) => c.name === "Corrente"));
  check("exporta o lançamento", json.lancamentos?.some((t: { description: string }) => t.description === "Café teste exportação"));
  check("NÃO exporta hash de senha", !conteudo.includes("passwordHash") && !conteudo.includes(u.passwordHash ?? "###"));

  // ===== Exclusão: proteções =====
  await page.goto(`${BASE}/conta`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Quero excluir minha conta/ }).click();

  // Confirmação errada é barrada.
  await page.fill("#password", SENHA);
  await page.fill("#confirmacao", "excluir"); // minúsculo
  await page.getByRole("button", { name: /Excluir minha conta/ }).click();
  await page.waitForTimeout(800);
  const [aindaExiste] = await db.select().from(users).where(eq(users.id, u.id));
  check("confirmação errada NÃO exclui", Boolean(aindaExiste));

  // Senha errada é barrada.
  await page.fill("#password", "senha-errada");
  await page.fill("#confirmacao", "EXCLUIR");
  await page.getByRole("button", { name: /Excluir minha conta/ }).click();
  await page.getByText(/Senha incorreta/).waitFor({ timeout: 10000 });
  check("senha errada é recusada", await page.getByText(/Senha incorreta/).isVisible());

  // ===== Exclusão de verdade =====
  await page.fill("#password", SENHA);
  await page.fill("#confirmacao", "EXCLUIR");
  await page.getByRole("button", { name: /Excluir minha conta/ }).click();
  await page.waitForURL(/\/entrar/, { timeout: 15000 });

  const restou = await db.select().from(users).where(eq(users.id, u.id));
  check("conta apagada do banco", restou.length === 0, `${restou.length}`);
  const txRestou = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("dados do espaço apagados em cascata", txRestou.length === 0, `${txRestou.length}`);

  await browser.close();
  // Limpeza defensiva caso algo tenha sobrado.
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
