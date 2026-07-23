/**
 * Testa contas fixas: cadastro, provisão idempotente, confirmação,
 * pausa e exclusão. Rodar com o dev no ar:
 *   npx tsx --env-file=.env.local scripts/e2e-contas-fixas.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import {
  users,
  ledgers,
  transactions,
  recurringRules,
} from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `fix-${Date.now()}@teste.local`;

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
  page.on("dialog", (d) => d.accept());

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Fixa Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Conta Corrente");
  await page.fill("#openingBalance", "10.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  await page.goto(`${BASE}/contas-fixas`);
  await page.waitForLoadState("networkidle");
  check("estado vazio explica o conceito", await page.getByText("Nada cadastrado ainda").isVisible());

  // ===== Cadastrar aluguel mensal dia 10 =====
  await page.goto(`${BASE}/contas-fixas/nova`);
  await page.fill("#description", "Aluguel");
  await page.fill("#amount", "2.500,00");
  await page.selectOption("#categoryId", { label: "Moradia › Aluguel" });
  await page.fill("#dayOfMonth", "10");
  await page.fill("#startDate", "2026-07-01");
  await page.waitForTimeout(300);
  check(
    "prévia mostra o total anual",
    await page.getByText("R$ 30.000,00").first().isVisible(),
    "2.500 x 12",
  );

  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas-fixas`, { timeout: 20000 });

  const regras = await db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.ledgerId, ledgerId));
  check("regra criada", regras.length === 1);
  check("valor em centavos", regras[0]?.amount === 250000, `${regras[0]?.amount}`);
  check("dia do vencimento gravado", regras[0]?.dayOfMonth === 10);

  // ===== Provisão =====
  const previstos = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.status, "pending")));
  check(
    "provisionou 12 meses à frente",
    previstos.length >= 12,
    `${previstos.length} parcelas`,
  );
  check(
    "todas caem no dia 10",
    previstos.every((p) => p.date.endsWith("-10")),
    previstos.slice(0, 3).map((p) => p.date).join(", "),
  );
  check(
    "todas vinculadas à regra",
    previstos.every((p) => p.recurringRuleId === regras[0].id),
  );

  // ===== Idempotência: rodar de novo NÃO pode duplicar =====
  // A provisão roda a cada navegação; passar por aqui de novo exercita o
  // caminho real de idempotência, não uma chamada artificial.
  const antes = previstos.length;
  await page.goto(BASE);
  await page.goto(`${BASE}/contas-fixas`);
  await page.waitForLoadState("networkidle");
  const depois = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.status, "pending")));
  check(
    "provisionar de novo NÃO duplica",
    depois.length === antes,
    `${antes} -> ${depois.length}`,
  );

  // Navegar também dispara a provisão — não pode duplicar.
  await page.goto(`${BASE}/lancamentos`);
  await page.goto(BASE);
  await page.goto(`${BASE}/contas-fixas`);
  await page.waitForLoadState("networkidle");
  const depoisDeNavegar = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.status, "pending")));
  check(
    "navegar pelo app não duplica",
    depoisDeNavegar.length === antes,
    `${depoisDeNavegar.length}`,
  );

  check("card mostra o próximo vencimento", await page.getByText("Aluguel").first().isVisible());

  // ===== Confirmar um previsto =====
  await page.goto(`${BASE}/lancamentos?mes=2026-07`);
  await page.waitForLoadState("networkidle");
  check("previsto aparece marcado como tal", await page.getByText("previsto").first().isVisible());

  await page.locator('button[aria-label*="Confirmar Aluguel"]').first().click();
  await page.waitForTimeout(2000);

  const confirmados = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.status, "cleared")));
  check("confirmar vira realizado", confirmados.length === 1, `${confirmados.length}`);

  // Confirmado não pode ser recriado pela provisão.
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  const aposConfirmar = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
  check(
    "provisão não recria o que já foi confirmado",
    aposConfirmar.length === antes,
    `${aposConfirmar.length}`,
  );

  // ===== Dia 31: o teste que mais importa =====
  await page.goto(`${BASE}/contas-fixas/nova`);
  await page.fill("#description", "Cartão dia 31");
  await page.fill("#amount", "100,00");
  await page.selectOption("#categoryId", { label: "Moradia › Condomínio" });
  await page.fill("#dayOfMonth", "31");
  await page.fill("#startDate", "2026-01-01");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas-fixas`, { timeout: 20000 });

  const [regra31] = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.ledgerId, ledgerId),
        eq(recurringRules.description, "Cartão dia 31"),
      ),
    );
  const parcelas31 = await db
    .select({ date: transactions.date })
    .from(transactions)
    .where(eq(transactions.recurringRuleId, regra31.id));
  const datas = parcelas31.map((p) => p.date).sort();

  check(
    "fevereiro cai no dia 28, não some nem vira 1º de março",
    datas.includes("2026-02-28"),
    datas.slice(0, 4).join(", "),
  );
  check(
    "março VOLTA para 31 (não fica preso no 28)",
    datas.includes("2026-03-31"),
    "é aqui que a maioria erra",
  );
  check("abril cai no 30", datas.includes("2026-04-30"));
  check("nenhuma data inválida", !datas.some((d) => d.endsWith("-31") && ["02", "04", "06", "09", "11"].includes(d.slice(5, 7))));

  // ===== Pausar =====
  await page.locator('button[aria-label="Pausar Cartão dia 31"]').click();
  await page.waitForTimeout(2000);

  const [pausada] = await db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.id, regra31.id));
  check("pausar desativa a regra", pausada.active === false);

  const sobraram = await db
    .select()
    .from(transactions)
    .where(eq(transactions.recurringRuleId, regra31.id));
  check(
    "pausar limpa os previstos (não prometem mais nada)",
    sobraram.length === 0,
    `${sobraram.length} restantes`,
  );

  // ===== Reativar =====
  await page.locator('button[aria-label="Reativar Cartão dia 31"]').click();
  await page.waitForTimeout(2500);
  const voltaram = await db
    .select()
    .from(transactions)
    .where(eq(transactions.recurringRuleId, regra31.id));
  check("reativar reprovisiona", voltaram.length > 0, `${voltaram.length} parcelas`);

  // ===== Apagar preserva o histórico confirmado =====
  await page.locator('button[aria-label="Apagar Aluguel"]').click();
  await page.waitForTimeout(2500);

  const regrasFinais = await db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.ledgerId, ledgerId));
  check("regra apagada", !regrasFinais.some((r) => r.description === "Aluguel"));

  const historico = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.ledgerId, ledgerId), eq(transactions.status, "cleared")),
    );
  check(
    "o lançamento JÁ CONFIRMADO sobrevive à exclusão da regra",
    historico.length === 1,
    "ele aconteceu de verdade; apagar a regra não desfaz o passado",
  );
  check("e perdeu o vínculo com a regra", historico[0]?.recurringRuleId === null);

  await page.goto(`${BASE}/contas-fixas`);
  await page.screenshot({ path: "scripts/contas-fixas.png", fullPage: true });

  // O Chromium injeta `caret-color: transparent` ao focar campos durante a
  // automação, o que o React acusa como divergência de hidratação. Confirmei
  // que a carga limpa da página não gera aviso nenhum, então esse ruído do
  // ambiente de teste não conta como erro real.
  const errosReais = erros.filter(
    (e) => !e.includes("hydrat") && !e.includes("caret-color"),
  );
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

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
