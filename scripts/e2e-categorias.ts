/**
 * Testa o CRUD de categorias: criar, renomear, arquivar, apagar e a proteção
 * do histórico. Rodar: npx tsx --env-file=.env.local scripts/e2e-categorias.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, categories } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `cat-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function esperar(page: any, ms = 1600) {
  await page.waitForTimeout(ms);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("dialog", (d) => d.accept());

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Cat Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta");
  await page.fill("#openingBalance", "5.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  await page.goto(`${BASE}/categorias`);
  await page.waitForLoadState("networkidle");
  check("tela lista os grupos padrão", await page.getByText("Moradia").first().isVisible());

  // ===== Criar grupo =====
  await page.locator('button:has-text("Novo grupo")').first().click();
  await page.fill('input[aria-label="Novo grupo de despesa"]', "Meu Grupo");
  await page.selectOption('select[aria-label="Centro de custo do novo grupo"]', {
    label: "Moradia",
  });
  await page.locator('button:has-text("Criar")').first().click();
  await esperar(page);

  const grupoDb = await db
    .select()
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.name, "Meu Grupo")));
  check("grupo criado no banco", grupoDb.length === 1);
  check("é de despesa", grupoDb[0]?.type === "expense", grupoDb[0]?.type);
  check("sem pai (é grupo)", grupoDb[0]?.parentId === null);
  check("com o centro de custo escolhido", !!grupoDb[0]?.costCenterId);
  check("marcado como criado pelo usuário", grupoDb[0]?.isDefault === false);
  check("aparece na tela", await page.getByText("Meu Grupo").first().isVisible());

  // ===== Criar subcategoria =====
  await page.locator('button[aria-label="Expandir Meu Grupo"]').click();
  await page.locator('button:has-text("Adicionar subcategoria")').first().click();
  await page.fill('input[aria-label="Nova subcategoria em Meu Grupo"]', "Minha Sub");
  await page.locator('button:has-text("Criar")').first().click();
  await esperar(page);

  const subDb = await db
    .select()
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.name, "Minha Sub")));
  check("subcategoria criada", subDb.length === 1);
  check("pendurada no grupo certo", subDb[0]?.parentId === grupoDb[0]?.id);
  check(
    "herdou o centro de custo do grupo",
    subDb[0]?.costCenterId === grupoDb[0]?.costCenterId,
  );

  // ===== Duplicata =====
  await page.locator('button:has-text("Adicionar subcategoria")').first().click();
  await page.fill('input[aria-label="Nova subcategoria em Meu Grupo"]', "Minha Sub");
  await page.locator('button:has-text("Criar")').first().click();
  await esperar(page);
  check(
    "duplicata é recusada com aviso",
    await page
      .getByText("Já existe uma categoria com esse nome aqui.")
      .first()
      .isVisible(),
  );
  await page.reload({ waitUntil: "networkidle" });

  // ===== Renomear =====
  await page.locator('button[aria-label="Expandir Meu Grupo"]').click();
  await page.locator('button[aria-label="Renomear Minha Sub"]').click();
  await page.fill('input[aria-label="Novo nome"]', "Sub Renomeada");
  await page.keyboard.press("Enter");
  await esperar(page);

  const [renomeada] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, subDb[0].id));
  check("renomear grava no banco", renomeada.name === "Sub Renomeada", renomeada.name);
  // Renomear não pode criar uma categoria nova: o histórico aponta para o id.
  check("renomear preserva o id (histórico intacto)", renomeada.id === subDb[0].id);

  // ===== Categoria em uso não pode ser apagada =====
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.fill("#amount", "50,00");
  await page.fill("#description", "Usa a sub");
  await page.selectOption('select[aria-label="Categoria 1"]', {
    label: "Meu Grupo › Sub Renomeada",
  });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  await page.goto(`${BASE}/categorias`);
  await page.waitForLoadState("networkidle");
  await page.locator('button[aria-label="Expandir Meu Grupo"]').click();
  await esperar(page, 400);

  const btnApagar = page.locator(
    'button[aria-label*="Sub Renomeada"][aria-label*="arquive"]',
  );
  check(
    "categoria com lançamento tem o apagar desativado",
    (await btnApagar.count()) === 1 && (await btnApagar.isDisabled()),
    "e o rótulo explica que deve arquivar",
  );

  // ===== Arquivar =====
  await page.locator('button[aria-label="Arquivar Sub Renomeada"]').click();
  await esperar(page);
  const [arq] = await db.select().from(categories).where(eq(categories.id, subDb[0].id));
  check("arquivar grava a data", !!arq.archivedAt);

  // Arquivada não pode mais aparecer como opção de lançamento.
  await page.goto(`${BASE}/lancamentos/novo`);
  const opcoes = await page
    .locator('select[aria-label="Categoria 1"] option')
    .allTextContents();
  check(
    "arquivada some das opções de lançamento",
    !opcoes.some((o: string) => o.includes("Sub Renomeada")),
  );

  // ===== Ver e reativar arquivadas =====
  await page.goto(`${BASE}/categorias?arquivadas=1`);
  await page.waitForLoadState("networkidle");
  await page.locator('button[aria-label="Expandir Meu Grupo"]').click();
  await esperar(page, 400);
  check(
    "filtro de arquivadas mostra ela",
    await page.getByText("Sub Renomeada").first().isVisible(),
  );

  await page.locator('button[aria-label="Reativar Sub Renomeada"]').click();
  await esperar(page);
  const [reativada] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, subDb[0].id));
  check("reativar limpa a data", reativada.archivedAt === null);

  // ===== Apagar categoria sem uso =====
  await page.goto(`${BASE}/categorias`);
  await page.waitForLoadState("networkidle");
  await page.locator('button:has-text("Novo grupo")').first().click();
  await page.fill('input[aria-label="Novo grupo de despesa"]', "Grupo Descartavel");
  await page.locator('button:has-text("Criar")').first().click();
  await esperar(page);

  await page.locator('button[aria-label="Apagar Grupo Descartavel"]').click();
  await esperar(page);

  const sumiu = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.ledgerId, ledgerId), eq(categories.name, "Grupo Descartavel")),
    );
  check("categoria sem uso é apagada de vez", sumiu.length === 0);

  await page.screenshot({ path: "scripts/categorias.png", fullPage: true });
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
    await db
      .delete(transactions)
      .where(eq(transactions.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
