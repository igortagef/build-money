/**
 * Tipos de bem editáveis: gerenciar a lista em /bens e usá-la ao cadastrar um
 * bem no patrimônio. Também a aba Parcelada dentro de novo lançamento.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-bens.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, transactions, assets, assetKinds } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `bens-${Date.now()}@teste.local`;

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
  await page.fill("#name", "Bens Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "1.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== /bens é o gerenciador de tipos, semeado com os padrões =====
  await page.goto(`${BASE}/bens`);
  await page.waitForLoadState("networkidle");
  check("título é 'Tipos de bem'", await page.getByRole("heading", { name: "Tipos de bem" }).isVisible());
  check("tipo padrão Imóvel existe", await page.getByText("Imóvel").first().isVisible());
  check("tipo padrão Veículo existe", await page.getByText("Veículo").first().isVisible());

  // Cria um tipo novo: "Joias".
  await page.getByRole("button", { name: /Novo tipo/ }).click();
  await page.getByLabel("Nome do novo tipo de bem").fill("Joias");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.waitForTimeout(800);
  check("tipo 'Joias' aparece na lista", await page.getByText("Joias").first().isVisible());

  const tiposDb = await db.select().from(assetKinds).where(eq(assetKinds.ledgerId, ledgerId));
  check("tipos semeados + novo no banco", tiposDb.length === 4, `${tiposDb.length}`);
  check("Joias gravado", tiposDb.some((t) => t.name === "Joias"));

  // ===== Cadastra um bem no patrimônio usando o tipo customizado =====
  await page.goto(`${BASE}/patrimonio/novo`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Bem", exact: true }).click();
  // O seletor de tipo de bem deve oferecer "Joias".
  await page.selectOption("#bemKind", { label: "Joias" });
  await page.fill("#name", "Anel de família");
  await page.fill("#current", "5.000,00");
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  check("bem aparece no patrimônio", await page.getByText("Anel de família").isVisible());
  check("bem mostra o tipo customizado 'Joias'", await page.getByText("Joias").first().isVisible());

  const bensDb = await db.select().from(assets).where(eq(assets.ledgerId, ledgerId));
  check("bem gravado com assetKindId", bensDb.length === 1 && !!bensDb[0].assetKindId, `${bensDb.length}`);
  check("bem tem kind 'other'", bensDb[0]?.kind === "other", bensDb[0]?.kind);

  // Tipo em uso não pode ser apagado (só arquivado).
  await page.goto(`${BASE}/bens`);
  await page.waitForLoadState("networkidle");
  check("tipo em uso mostra contagem", await page.getByText(/1 bem usa este tipo/).isVisible());
  const apagarJoias = page.getByRole("button", { name: /Joias está em uso/ });
  check("apagar de tipo em uso fica desabilitado", await apagarJoias.isDisabled());

  // ===== Aba Parcelada dentro de novo lançamento (consolidação) =====
  await page.goto(`${BASE}/lancamentos/novo?aba=parcelada`);
  await page.waitForLoadState("networkidle");
  check("aba Parcelada existe", await page.getByRole("tab", { name: /Parcelada/ }).isVisible());
  check("form de parcelamento carrega", await page.locator("#parcelas").isVisible());

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(transactions).where(eq(transactions.ledgerId, ledgerId));
  await db.delete(assets).where(eq(assets.ledgerId, ledgerId));
  await db.delete(assetKinds).where(eq(assetKinds.ledgerId, ledgerId));
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
    await db.delete(assets).where(eq(assets.ledgerId, u.defaultLedgerId!));
    await db.delete(assetKinds).where(eq(assetKinds.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
