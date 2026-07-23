/**
 * Console de administração separado + gestão/monitoramento de usuários.
 * Prova: admin loga num sistema próprio (/admin) SEM finanças; usuário de
 * finanças não entra no /admin; monitoramento é por agregados (nunca conteúdo
 * de lançamento); inativar bloqueia o app mas preserva exportar/excluir; reativar.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-admin-usuarios.ts
 */
import { chromium, type Page } from "playwright";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, accounts, categories, transactions, transactionSplits } from "../src/db/schema";

const BASE = "http://localhost:3000";
const stamp = Date.now();
const adminEmail = `admin-${stamp}@teste.local`;
const amigoEmail = `amigo-${stamp}@teste.local`;
const SENHA = "senha-de-teste-123";
const SEGREDO = "PIZZA-SECRETA-DO-AMIGO-9999"; // descrição que o admin NÃO pode ver

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function cadastrar(page: Page, nome: string, email: string) {
  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", nome);
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/cadastrar"), { timeout: 20000 });
}

async function logar(page: Page, email: string) {
  await page.goto(`${BASE}/entrar`);
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
}

async function main() {
  const browser = await chromium.launch();

  // ---- Amigo (usuário de finanças) cria um lançamento com descrição secreta ----
  const ctxAmigo = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pAmigo = await ctxAmigo.newPage();
  await cadastrar(pAmigo, "Amigo Teste", amigoEmail);
  const [amigo] = await db.select().from(users).where(eq(users.email, amigoEmail));
  const amigoLedger = amigo.defaultLedgerId!;
  const [cat] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.ledgerId, amigoLedger), eq(categories.type, "expense"))).limit(1);
  const [conta] = await db.insert(accounts)
    .values({ ledgerId: amigoLedger, name: "Conta Amigo", type: "checking", currency: "BRL", openingBalance: 0 })
    .returning({ id: accounts.id });
  const [tx] = await db.insert(transactions).values({
    ledgerId: amigoLedger, accountId: conta.id, type: "expense", status: "cleared",
    amount: 5000, currency: "BRL", amountBase: 5000, description: SEGREDO, date: "2026-07-10",
  }).returning({ id: transactions.id });
  await db.insert(transactionSplits).values({ transactionId: tx.id, categoryId: cat.id, amount: 5000, amountBase: 5000, sortOrder: 0 });
  await ctxAmigo.close();

  // ---- Conta de admin: cadastra e é promovida via DB ----
  const ctxSetup = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pSetup = await ctxSetup.newPage();
  await cadastrar(pSetup, "Admin Teste", adminEmail);
  await ctxSetup.close();
  const [admin] = await db.select().from(users).where(eq(users.email, adminEmail));
  await db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.id));

  // ---- Admin loga: cai no console /admin (sistema à parte, sem finanças) ----
  const ctxAdmin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pAdmin = await ctxAdmin.newPage();
  await logar(pAdmin, adminEmail);
  await pAdmin.waitForURL(/\/admin$/, { timeout: 15000 });
  check("admin loga direto no console /admin", pAdmin.url().endsWith("/admin"));
  check("painel do admin abre", await pAdmin.getByRole("heading", { name: /Painel/ }).isVisible());

  // Admin é bloqueado de finanças: rota financeira volta para /admin.
  await pAdmin.goto(`${BASE}/lancamentos`);
  await pAdmin.waitForURL(/\/admin$/, { timeout: 15000 });
  check("admin não acessa finanças (redireciona a /admin)", pAdmin.url().endsWith("/admin"));

  // ---- Monitoramento em /admin/usuarios ----
  await pAdmin.goto(`${BASE}/admin/usuarios`);
  await pAdmin.waitForLoadState("networkidle");
  check("admin vê o amigo na lista", await pAdmin.getByText(amigoEmail).first().isVisible());
  check("mostra contagem de lançamentos (1 lanç.)", await pAdmin.getByText(/1 lanç\./).first().isVisible());
  const htmlUsuarios = await pAdmin.content();
  check("admin NÃO vê o conteúdo do lançamento do amigo", !htmlUsuarios.includes(SEGREDO));

  // ---- Classificar e definir prazo de acesso ----
  const linhaAmigo = pAdmin.locator(`[data-email="${amigoEmail}"]`);
  await linhaAmigo.locator('select[name="classificacao"]').selectOption("amigo");
  let classificacao: string | null = null;
  for (let i = 0; i < 12; i++) {
    const [r] = await db.select({ c: users.classificacao }).from(users).where(eq(users.id, amigo.id));
    classificacao = r.c;
    if (classificacao === "amigo") break;
    await pAdmin.waitForTimeout(300);
  }
  check("classificação gravada", classificacao === "amigo", classificacao ?? "(vazio)");

  await linhaAmigo.locator('input[name="dias"]').fill("30");
  await linhaAmigo.getByRole("button", { name: /Definir/ }).click();
  await linhaAmigo.getByText(/30 dias de acesso/).waitFor({ timeout: 10000 });
  const [comPrazo] = await db.select().from(users).where(eq(users.id, amigo.id));
  check("prazo de 30 dias gravado", Boolean(comPrazo.accessUntil), comPrazo.accessUntil ?? "");

  // ---- Usuário vê os dias de acesso no app ----
  const ctxDias = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pDias = await ctxDias.newPage();
  await logar(pDias, amigoEmail);
  await pDias.waitForURL(`${BASE}/`, { timeout: 15000 });
  check("usuário vê os dias de acesso no app", await pDias.getByText(/dias de acesso/).first().isVisible());
  await ctxDias.close();

  // ---- Prazo vencido restringe o acesso (como uma desativação) ----
  const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await db.update(users).set({ accessUntil: ontem }).where(eq(users.id, amigo.id));
  const ctxVenc = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pVenc = await ctxVenc.newPage();
  await logar(pVenc, amigoEmail);
  await pVenc.waitForURL(/\/conta$/, { timeout: 15000 });
  check("prazo vencido cai na área restrita (/conta)", pVenc.url().endsWith("/conta"));
  await ctxVenc.close();
  // Restaura para não atrapalhar o resto do fluxo.
  await db.update(users).set({ accessUntil: null }).where(eq(users.id, amigo.id));

  // ---- Usuário de finanças NÃO entra no /admin ----
  const ctxA2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pA2 = await ctxA2.newPage();
  await logar(pA2, amigoEmail);
  await pA2.waitForURL(`${BASE}/`, { timeout: 15000 });
  await pA2.goto(`${BASE}/admin`);
  await pA2.waitForURL(`${BASE}/`, { timeout: 15000 });
  check("usuário de finanças é barrado do console /admin", pA2.url() === `${BASE}/`);
  await ctxA2.close();

  // ---- Inativar o amigo (linha escopada; há outros usuários no sistema) ----
  const linha = pAdmin.locator(`[data-email="${amigoEmail}"]`);
  await linha.getByRole("button", { name: /^Inativar$/ }).click();
  await linha.getByRole("button", { name: /Reativar/ }).waitFor({ timeout: 10000 });
  const [depois] = await db.select().from(users).where(eq(users.id, amigo.id));
  check("amigo marcado como desativado", Boolean(depois.deactivatedAt), depois.deactivatedReason ?? "");

  // ---- Amigo inativo loga: só a área restrita (/conta) ----
  const ctxLogin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const pLogin = await ctxLogin.newPage();
  await logar(pLogin, amigoEmail);
  await pLogin.waitForURL(/\/conta$/, { timeout: 15000 });
  check("login do inativo cai em /conta", pLogin.url().endsWith("/conta"));
  check("mostra aviso de conta inativa", await pLogin.getByText(/conta está inativa/i).isVisible());

  await pLogin.goto(`${BASE}/lancamentos`);
  await pLogin.waitForURL(/\/conta$/, { timeout: 15000 });
  check("tela financeira do inativo redireciona para /conta", pLogin.url().endsWith("/conta"));

  const dl = await Promise.all([
    pLogin.waitForEvent("download", { timeout: 15000 }),
    pLogin.getByRole("link", { name: /Baixar meus dados/ }).click(),
  ]).then(([x]) => x);
  const caminho = await dl.path();
  const conteudo = caminho ? (await import("fs")).readFileSync(caminho, "utf8") : "";
  check("inativo consegue exportar os próprios dados", conteudo.includes(amigoEmail) && conteudo.includes(SEGREDO));
  await pLogin.getByRole("button", { name: /Quero excluir minha conta/ }).click();
  check("inativo vê a opção de excluir a conta", await pLogin.getByText(/Digite/).first().isVisible());
  await ctxLogin.close();

  // ---- Reativar ----
  await pAdmin.goto(`${BASE}/admin/usuarios`);
  await pAdmin.waitForLoadState("networkidle");
  const linha2 = pAdmin.locator(`[data-email="${amigoEmail}"]`);
  await linha2.getByRole("button", { name: /Reativar/ }).click();
  await linha2.getByRole("button", { name: /^Inativar$/ }).waitFor({ timeout: 10000 });
  const [reativado] = await db.select().from(users).where(eq(users.id, amigo.id));
  check("amigo reativado (sem marca de desativação)", !reativado.deactivatedAt);

  await ctxAdmin.close();
  await browser.close();

  // ---- Limpeza (respeita FKs RESTRICT) ----
  for (const ledgerId of [amigoLedger, admin.defaultLedgerId].filter(Boolean) as string[]) {
    const txs = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ledgerId, ledgerId));
    if (txs.length) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txs.map((t) => t.id)));
    await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
    await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  }
  await db.delete(users).where(eq(users.id, amigo.id));
  await db.delete(users).where(eq(users.id, admin.id));

  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
