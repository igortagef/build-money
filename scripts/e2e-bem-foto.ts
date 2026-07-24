/**
 * Cadastro de bem com FOTO (detalhe visual): a imagem é reduzida no navegador,
 * salva no bem e aparece como miniatura na lista de patrimônio.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-bem-foto.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, assets, assetSnapshots } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `bf-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";
// PNG 2x2 vermelho.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAmvwPxxV/UBwAAAABJRU5ErkJggg==";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "BF Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/patrimonio/novo`);
  await page.waitForLoadState("networkidle");
  // Alterna para "Bem".
  await page.getByRole("button", { name: "Bem", exact: true }).click();
  await page.fill("#name", "Meu carro");
  await page.fill("#current", "50.000,00");
  // Envia a foto pelo input de arquivo (oculto no picker).
  await page.setInputFiles('input[type="file"]', { name: "carro.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
  await page.getByAltText("Prévia do bem").waitFor({ timeout: 8000 });
  check("prévia da foto aparece no form", await page.getByAltText("Prévia do bem").isVisible());

  await page.getByRole("button", { name: /Adicionar ao patrimônio/ }).click();
  await page.waitForURL(/\/patrimonio$/, { timeout: 15000 });

  const [bem] = await db.select().from(assets).where(eq(assets.ledgerId, ledgerId));
  check("foto salva no bem (data URL)", /^data:image\//.test(bem?.imageUrl ?? ""), (bem?.imageUrl ?? "").slice(0, 20));
  check("miniatura aparece na lista", (await page.getByRole("img", { name: "Meu carro" }).count()) > 0);

  await browser.close();
  await db.delete(assetSnapshots).where(eq(assetSnapshots.assetId, bem.id));
  await db.delete(assets).where(eq(assets.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
