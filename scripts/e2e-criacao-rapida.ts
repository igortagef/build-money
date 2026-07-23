/**
 * Testa criar conta e categoria de dentro da tela de lançamento, sem perder o
 * que já foi digitado. Rodar com o dev no ar:
 *   npx tsx --env-file=.env.local scripts/e2e-criacao-rapida.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, accounts, categories } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `qc-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Rapido Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta Original");
  await page.fill("#openingBalance", "5.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Criar conta de dentro do lançamento =====
  await page.goto(`${BASE}/lancamentos/novo`);

  // Digita o lançamento ANTES de criar a conta: o que já foi digitado não
  // pode se perder quando a conta nova for criada.
  await page.fill("#amount", "123,45");
  await page.fill("#description", "Lançamento em digitação");

  await page.click('button[aria-label="Cadastrar nova conta"]');
  check("painel de nova conta abre", await page.getByText("Nova conta").first().isVisible());

  await page.fill('input[aria-label="Nome da nova conta"]', "Cartão Criado na Hora");
  await page.selectOption('select[aria-label="Tipo da nova conta"]', "credit_card");
  await page.click('button:has-text("Criar conta")');
  await page.waitForTimeout(2000);

  const contasDb = await db.select().from(accounts).where(eq(accounts.ledgerId, ledgerId));
  check("conta foi criada no banco", contasDb.length === 2, `${contasDb.length} contas`);
  const nova = contasDb.find((c) => c.name === "Cartão Criado na Hora");
  check("com o tipo escolhido", nova?.type === "credit_card", nova?.type);

  check(
    "conta nova já vem selecionada",
    (await page.inputValue("#accountId")) === nova?.id,
  );
  // O ponto central: criar a conta não pode limpar o formulário.
  check(
    "valor digitado sobreviveu",
    (await page.inputValue("#amount")) === "123,45",
    `campo tem "${await page.inputValue("#amount")}"`,
  );
  check(
    "descrição digitada sobreviveu",
    (await page.inputValue("#description")) === "Lançamento em digitação",
  );
  check("painel fechou após criar", !(await page.getByText("Nova conta").first().isVisible()));

  // ===== Criar categoria de dentro do lançamento =====
  await page.click('button[aria-label*="Cadastrar nova categoria"]');
  check(
    "painel de categoria abre com o tipo certo",
    await page.getByText("Nova categoria de despesa").isVisible(),
  );

  await page.fill('input[aria-label="Nome da nova categoria"]', "Assinatura de Software");
  await page.selectOption('select[aria-label="Grupo da nova categoria"]', { label: "Dentro de Lazer" });
  await page.click('button:has-text("Criar categoria")');
  await page.waitForTimeout(2000);

  const catsDb = await db
    .select()
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.name, "Assinatura de Software")));
  check("categoria criada no banco", catsDb.length === 1);
  check("é de despesa", catsDb[0]?.type === "expense", catsDb[0]?.type);
  check("ficou dentro do grupo escolhido", !!catsDb[0]?.parentId);
  check("marcada como criada pelo usuário", catsDb[0]?.isDefault === false);
  check(
    "herdou o centro de custo do grupo",
    !!catsDb[0]?.costCenterId,
    "Lazer -> Pessoal e lazer",
  );

  check(
    "categoria nova já vem selecionada",
    (await page.inputValue('select[aria-label="Categoria 1"]')) === catsDb[0]?.id,
  );

  // ===== Duplicata é recusada =====
  await page.click('button[aria-label*="Cadastrar nova categoria"]');
  await page.fill('input[aria-label="Nome da nova categoria"]', "Assinatura de Software");
  await page.selectOption('select[aria-label="Grupo da nova categoria"]', { label: "Dentro de Lazer" });
  await page.click('button:has-text("Criar categoria")');
  await page.waitForTimeout(1500);
  check(
    "categoria duplicada é recusada com aviso",
    await page.getByText("Já existe uma categoria com esse nome aqui.").isVisible(),
  );
  await page.click('button[aria-label="Cancelar"]');

  // ===== O lançamento ainda salva normalmente =====
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const txs = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("lançamento salvou com a conta e categoria novas", txs.length === 1, `${txs.length}`);
  check("valor correto em centavos", txs[0]?.amount === 12345, `${txs[0]?.amount}`);
  check("usou a conta criada na hora", txs[0]?.accountId === nova?.id);

  // ===== Trocar para receita troca os grupos oferecidos =====
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.click('button:has-text("Receita")');
  await page.click('button[aria-label*="Cadastrar nova categoria"]');
  await page.waitForTimeout(1000);
  check(
    "painel avisa que é categoria de receita",
    await page.getByText("Nova categoria de receita").isVisible(),
  );
  const grupos = await page
    .locator('select[aria-label="Grupo da nova categoria"] option')
    .allTextContents();
  check(
    "oferece só grupos de receita",
    grupos.some((g) => g.includes("Salário")) && !grupos.some((g) => g.includes("Moradia")),
    grupos.slice(0, 4).join(" | "),
  );

  await page.screenshot({ path: "scripts/criacao-rapida.png", fullPage: true });
  check("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));

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
