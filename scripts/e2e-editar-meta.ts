/**
 * Edição de metas: alterar nome/valor/data e ver o status se ajustar ao novo
 * alvo (baixou abaixo do guardado → atingida; subiu acima → volta a ativa).
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-editar-meta.ts
 */
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, ledgers, goals, goalContributions } from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `meta-${Date.now()}@teste.local`;
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
  await page.fill("#name", "Meta Teste");
  await page.fill("#email", email);
  await page.fill("#password", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Meta alvo R$100, com R$20 já guardados.
  const hoje = new Date().toISOString().slice(0, 10);
  const [meta] = await db.insert(goals)
    .values({ ledgerId, name: "Reserva", targetAmount: 10000, currency: "BRL", startDate: hoje, status: "active" })
    .returning({ id: goals.id });
  await db.insert(goalContributions).values({ goalId: meta.id, amount: 2000, date: hoje });

  const editar = `${BASE}/metas/${meta.id}/editar`;

  // ---- Editar nome e valor (continua ativa: 20 < 80) ----
  await page.goto(editar);
  await page.waitForLoadState("networkidle");
  await page.fill("#name", "Reserva de emergência");
  await page.fill("#targetAmount", "80,00");
  await page.fill("#targetDate", "2026-12-31");
  await page.getByRole("button", { name: /Salvar alterações/ }).click();
  await page.waitForURL(/\/metas$/, { timeout: 15000 });
  const [m1] = await db.select().from(goals).where(eq(goals.id, meta.id));
  check("nome editado", m1.name === "Reserva de emergência", m1.name);
  check("valor alvo editado", m1.targetAmount === 8000, String(m1.targetAmount));
  check("data alvo editada", m1.targetDate === "2026-12-31", m1.targetDate ?? "");
  check("continua ativa (guardado < alvo)", m1.status === "active", m1.status);
  check("página mostra o novo nome", await page.getByText("Reserva de emergência").first().isVisible());

  // ---- Baixar o alvo abaixo do guardado → atingida ----
  await page.goto(editar);
  await page.waitForLoadState("networkidle");
  await page.fill("#targetAmount", "15,00"); // 1500 < 2000 guardado
  await page.getByRole("button", { name: /Salvar alterações/ }).click();
  await page.waitForURL(/\/metas$/, { timeout: 15000 });
  const [m2] = await db.select().from(goals).where(eq(goals.id, meta.id));
  check("virou atingida ao baixar o alvo", m2.status === "achieved", m2.status);
  check("marcou achievedAt", Boolean(m2.achievedAt));

  // ---- Subir o alvo acima do guardado → volta a ativa ----
  await page.goto(editar);
  await page.waitForLoadState("networkidle");
  await page.fill("#targetAmount", "50,00"); // 5000 > 2000
  await page.getByRole("button", { name: /Salvar alterações/ }).click();
  await page.waitForURL(/\/metas$/, { timeout: 15000 });
  const [m3] = await db.select().from(goals).where(eq(goals.id, meta.id));
  check("voltou a ativa ao subir o alvo", m3.status === "active", m3.status);
  check("limpou achievedAt", m3.achievedAt === null);

  await browser.close();
  // Limpeza (aportes caem por cascade do goal; goals por cascade do ledger).
  await db.delete(goals).where(eq(goals.ledgerId, ledgerId));
  await db.delete(ledgers).where(eq(ledgers.id, ledgerId));
  await db.delete(users).where(eq(users.id, u.id));
  console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
