/**
 * Testa a seção de patrimônio: investimentos (renda fixa/variável), bens,
 * rendimento, filtros, atualização de valor com snapshot, evolução.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-patrimonio.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, assets, assetSnapshots } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `patr-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("dialog", (d) => d.accept());

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Patr Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // ===== Vazio =====
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await page.click('a:has-text("Patrimônio")');
  await page.waitForURL("**/patrimonio", { timeout: 20000 });
  check("patrimônio abre pelo menu", await page.getByText(/construir seu patrimônio/).isVisible());

  // ===== Investimento renda fixa: aportou 10.000, vale 10.800 (+8%) =====
  await page.goto(`${BASE}/patrimonio/novo`);
  // Investimento é o modo padrão do formulário.
  await page.selectOption("#invKind", "fixed_income");
  await page.fill("#name", "Tesouro Selic");
  await page.fill("#detail", "Tesouro Direto");
  await page.fill("#invested", "10.000,00");
  await page.fill("#current", "10.800,00");
  await page.waitForTimeout(300);
  check("prévia mostra o rendimento (+8%)", await page.getByText(/\+8%/).first().isVisible());
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  const fixa = await db
    .select()
    .from(assets)
    .where(and(eq(assets.ledgerId, ledgerId), eq(assets.kind, "fixed_income")));
  check("investimento renda fixa criado", fixa.length === 1);
  check("valor investido em centavos", fixa[0]?.investedValue === 1000000, `${fixa[0]?.investedValue}`);
  check("valor atual em centavos", fixa[0]?.currentValue === 1080000, `${fixa[0]?.currentValue}`);

  // Snapshot inicial gravado.
  const snapsF = await db.select().from(assetSnapshots).where(eq(assetSnapshots.assetId, fixa[0].id));
  check("snapshot inicial criado", snapsF.length === 1 && snapsF[0].value === 1080000);

  // ===== Investimento renda variável: aportou 5.000, vale 4.500 (−10%) =====
  await page.goto(`${BASE}/patrimonio/novo`);
  await page.selectOption("#invKind", "variable_income");
  await page.fill("#name", "Ações XPTO");
  await page.fill("#invested", "5.000,00");
  await page.fill("#current", "4.500,00");
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  // ===== Bem: apartamento de 300.000 (tipo da lista editável) =====
  await page.goto(`${BASE}/patrimonio/novo`);
  await page.getByRole("button", { name: "Bem", exact: true }).click();
  await page.selectOption("#bemKind", { label: "Imóvel" });
  await page.fill("#name", "Apartamento");
  // Bem não tem campo "investido".
  check("bem não pede valor investido", (await page.locator("#invested").count()) === 0);
  await page.fill("#current", "300.000,00");
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  // ===== Resumo =====
  await page.goto(`${BASE}/patrimonio`);
  await page.waitForLoadState("networkidle");
  // Patrimônio total = 10.800 + 4.500 + 300.000 = 315.300.
  check("patrimônio total soma tudo", await page.getByText("R$ 315.300,00").first().isVisible());
  // Investido = 10.000 + 5.000 = 15.000. Rendimento = (10.800+4.500) - 15.000 = +300.
  check("rendimento consolidado (+300)", await page.getByText("R$ 300,00").first().isVisible());

  // ===== Filtro renda fixa =====
  await page.goto(`${BASE}/patrimonio?tipo=fixa`);
  await page.waitForLoadState("networkidle");
  check("filtro renda fixa mostra Tesouro", await page.getByText("Tesouro Selic").first().isVisible());
  check("e esconde as ações", !(await page.getByText("Ações XPTO").first().isVisible()));

  await page.goto(`${BASE}/patrimonio?tipo=variavel`);
  await page.waitForLoadState("networkidle");
  check("filtro renda variável mostra as ações", await page.getByText("Ações XPTO").first().isVisible());
  check("e esconde o Tesouro", !(await page.getByText("Tesouro Selic").first().isVisible()));

  // ===== Atualizar valor gera novo snapshot =====
  await page.goto(`${BASE}/patrimonio`);
  await page.waitForLoadState("networkidle");
  // Clica no valor do Tesouro para editar (primeiro editável da lista de investimentos).
  await page.getByText("R$ 10.800,00").first().click();
  await page.fill('input[aria-label="Novo valor"]', "11.000,00");
  await page.click('button[aria-label="Salvar novo valor"]');
  await page.waitForTimeout(1600);

  const [fixaApos] = await db.select().from(assets).where(eq(assets.id, fixa[0].id));
  check("valor atualizado no banco", fixaApos.currentValue === 1100000, `${fixaApos.currentValue}`);

  const snapsApos = await db.select().from(assetSnapshots).where(eq(assetSnapshots.assetId, fixa[0].id));
  // Mesmo dia: sobrescreve, não duplica.
  check("atualizar no mesmo dia não duplica snapshot", snapsApos.length === 1, `${snapsApos.length}`);
  check("snapshot reflete o novo valor", snapsApos[0].value === 1100000);

  // ===== Remover um bem =====
  await page.goto(`${BASE}/patrimonio`);
  await page.waitForLoadState("networkidle");
  await page.locator('button[aria-label="Remover Apartamento"]').click();
  await page.waitForTimeout(1600);
  const restantes = await db.select().from(assets).where(eq(assets.ledgerId, ledgerId));
  check("bem removido do patrimônio", !restantes.some((a) => a.name === "Apartamento"));

  // ===== Bem com tipo da lista editável ("Outro") =====
  await page.goto(`${BASE}/patrimonio/novo`);
  await page.getByRole("button", { name: "Bem", exact: true }).click();
  await page.selectOption("#bemKind", { label: "Outro" });
  await page.fill("#name", "Aliança de ouro");
  await page.fill("#current", "8.000,00");
  await page.click('button:has-text("Adicionar ao patrimônio")');
  await page.waitForURL(`${BASE}/patrimonio`, { timeout: 20000 });

  const alianca = await db
    .select()
    .from(assets)
    .where(and(eq(assets.ledgerId, ledgerId), eq(assets.name, "Aliança de ouro")));
  check("bem com tipo da lista criado", alianca.length === 1);
  check("bem usa kind 'other'", alianca[0]?.kind === "other", `${alianca[0]?.kind}`);
  check("tipo de bem vinculado (assetKindId)", !!alianca[0]?.assetKindId);
  check("tela mostra o tipo do bem", await page.getByText("Outro").first().isVisible());

  await page.screenshot({ path: "scripts/patrimonio.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(assets).where(eq(assets.ledgerId, ledgerId));
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
    await db.delete(assets).where(eq(assets.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
