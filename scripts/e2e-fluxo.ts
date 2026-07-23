/**
 * Percorre o fluxo real no navegador: cadastro -> painel -> criar conta ->
 * ver saldo. Depois apaga o usuário de teste do banco.
 *
 * Rodar com o servidor de dev no ar:
 *   npx tsx --env-file=.env.local scripts/e2e-fluxo.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `e2e-${Date.now()}@teste.local`;
const senha = "senha-de-teste-123";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(String(e)));

  // --- Cadastro ---
  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Igor Teste");
  await page.fill("#email", email);
  await page.fill("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  check("cadastro leva ao painel", page.url() === `${BASE}/`, page.url());
  check(
    "painel saúda pelo primeiro nome",
    await page.getByText("Olá, Igor").isVisible(),
  );
  check(
    "painel novo guia pelos primeiros passos",
    await page.getByText("Cadastre sua primeira conta").isVisible(),
  );

  // --- Categorias vieram do seed ---
  await page.goto(`${BASE}/categorias`);
  const temMoradia = await page.getByText("Moradia").first().isVisible();
  const temSalario = await page.getByText("Salário").first().isVisible();
  check("categorias padrão de despesa aparecem", temMoradia);
  check("categorias padrão de receita aparecem", temSalario);

  // --- Criar conta corrente ---
  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Nubank");
  await page.selectOption("#type", "checking");
  await page.fill("#openingBalance", "1.500,50");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  check(
    "conta criada aparece na lista",
    await page.getByText("Nubank").first().isVisible(),
  );
  check(
    "saldo inicial formatado corretamente",
    await page.getByText("R$ 1.500,50").first().isVisible(),
    "esperado R$ 1.500,50",
  );

  // --- Campos do cartão aparecem só para cartão ---
  await page.goto(`${BASE}/contas/nova`);
  const fechamentoOculto = await page.locator("#statementClosingDay").count();
  await page.selectOption("#type", "credit_card");
  const fechamentoVisivel = await page.locator("#statementClosingDay").count();
  check(
    "campos do cartão só aparecem ao escolher cartão",
    fechamentoOculto === 0 && fechamentoVisivel === 1,
  );

  // --- Validação: cartão sem fechamento deve ser rejeitado ---
  await page.fill("#name", "Cartão sem dados");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  check(
    "cartão sem dia de fechamento é rejeitado",
    await page.getByText("Informe o dia do fechamento da fatura").isVisible(),
  );

  // --- Painel com a conta criada ---
  await page.goto(BASE);
  check(
    "painel mostra o saldo em contas",
    await page.getByText("Saldo em contas").isVisible(),
  );
  // O KPI "sobe" de zero (AnimatedNumber); espera o valor final assentar.
  await page.getByText("R$ 1.500,50").first().waitFor({ timeout: 5000 });
  check(
    "saldo reflete a conta",
    await page.getByText("R$ 1.500,50").first().isVisible(),
  );

  // --- Tema escuro ---
  await page.getByRole("button", { name: "Escuro" }).click();
  await page.waitForTimeout(400);
  const classe = await page.locator("html").getAttribute("class");
  check("tema escuro aplica a classe .dark", !!classe?.includes("dark"), classe ?? "");
  await page.screenshot({ path: "scripts/tela-escuro.png", fullPage: true });

  await page.getByRole("button", { name: "Claro" }).click();
  await page.waitForTimeout(400);
  const classeClara = await page.locator("html").getAttribute("class");
  check(
    "tema claro remove a classe .dark",
    !classeClara?.includes("dark"),
    classeClara ?? "",
  );
  await page.screenshot({ path: "scripts/tela-claro.png", fullPage: true });

  // --- Sair e proteção de rota ---
  await page.getByRole("button", { name: /IT|igor/i }).first().click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await page.waitForURL(`${BASE}/entrar`, { timeout: 20000 });
  check("sair leva ao login", page.url() === `${BASE}/entrar`);

  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  check(
    "painel bloqueia acesso sem sessão",
    page.url().includes("/entrar"),
    page.url(),
  );

  // --- Login com a senha correta ---
  await page.goto(`${BASE}/entrar`);
  await page.fill("#email", email);
  await page.fill("#password", "senha-errada");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  check(
    "senha errada é recusada",
    await page.getByText("E-mail ou senha incorretos").isVisible(),
  );

  // O React 19 limpa o formulário após a ação; o e-mail precisa sobreviver
  // ao erro, senão o usuário redigita tudo a cada tentativa.
  check(
    "e-mail permanece preenchido após erro de senha",
    (await page.inputValue("#email")) === email,
    `campo tem "${await page.inputValue("#email")}"`,
  );

  await page.fill("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  check("login com senha correta entra", page.url() === `${BASE}/`);
  // O painel é gerencial e não lista contas por nome; a conta persistida se
  // confere na própria seção de contas.
  await page.goto(`${BASE}/contas`);
  await page.waitForLoadState("networkidle");
  check(
    "dados continuam lá após novo login",
    await page.getByText("Nubank").first().isVisible(),
  );

  check("nenhum erro de console", erros.length === 0, erros.slice(0, 3).join(" | "));

  await browser.close();

  // --- Limpeza ---
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) {
    await db.delete(transactions).where(eq(transactions.ledgerId, user.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
    console.log("\nusuário de teste removido do banco");
  }

  console.log(
    failures === 0 ? "\nFluxo completo passou.\n" : `\n${failures} falharam.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("ERRO:", err.message);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) {
    await db.delete(transactions).where(eq(transactions.ledgerId, user.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  process.exit(1);
});
