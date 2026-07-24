/**
 * Foto de perfil: cada usuário pode enviar a sua (redimensionada no navegador),
 * que aparece no avatar; e removê-la, voltando às iniciais.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-foto-perfil.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `foto-${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

// PNG 2x2 vermelho (base64) — arquivo mínimo válido para o input de imagem.
const PNG_2x2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAmvwPxxV/UBwAAAABJRU5ErkJggg==";

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Foto Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));

  // Vai para "Minha conta" e envia a foto pelo input de arquivo.
  await page.goto(`${BASE}/conta`);
  await page.waitForLoadState("networkidle");
  await page.setInputFiles('input[type="file"]', {
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_2x2, "base64"),
  });
  // O botão de salvar aparece após o processamento no navegador.
  await page.getByRole("button", { name: /Salvar foto/ }).click();
  await page.getByText(/Foto atualizada/).waitFor({ timeout: 10000 });

  const [comFoto] = await db.select({ img: users.imageUrl }).from(users).where(eq(users.id, u.id));
  check("foto gravada como data URL de imagem", /^data:image\/(jpeg|png|webp);base64,/.test(comFoto.img ?? ""), (comFoto.img ?? "").slice(0, 24));

  // O avatar do cabeçalho passa a ser <img> (não mais as iniciais).
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const temImg = await page.locator('header img[alt="Foto Teste"]').count();
  check("cabeçalho mostra a foto (img)", temImg > 0, `${temImg} img`);

  // Remove a foto → volta às iniciais.
  await page.goto(`${BASE}/conta`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Remover$/ }).click();
  await page.waitForTimeout(1200);
  const [semFoto] = await db.select({ img: users.imageUrl }).from(users).where(eq(users.id, u.id));
  check("foto removida do banco", semFoto.img === null, semFoto.img ?? "null");

  await browser.close();
  await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
