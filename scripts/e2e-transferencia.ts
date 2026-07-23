/**
 * Testa transferências entre contas e pagamento de fatura.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-transferencia.ts
 */
import { chromium } from "playwright";
import { db } from "../src/db";
import { users, ledgers, accounts, transactions } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";

const BASE = "http://localhost:3000";
const email = `transf-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

/**
 * Saldo real de uma conta, calculado do banco com a mesma regra do painel:
 * saldo inicial + movimentos realizados. Mais robusto que raspar a tela.
 */
async function saldo(ledgerId: string, nome: string): Promise<number> {
  const [conta] = await db
    .select({ id: accounts.id, opening: accounts.openingBalance })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.name, nome)))
    .limit(1);
  const [mov] = await db
    .select({
      total: sql<number>`coalesce(sum(
        case when ${transactions.status} = 'pending' then 0
             when ${transactions.type} = 'expense' then -${transactions.amount}
             else ${transactions.amount} end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(eq(transactions.accountId, conta.id));
  return conta.opening + mov.total;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Transf Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  // Corrente com saldo, poupança zerada, e um cartão de crédito.
  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "5.000,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Poupança");
  await page.selectOption("#type", "savings");
  await page.fill("#openingBalance", "0,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Cartão");
  await page.selectOption("#type", "credit_card");
  await page.fill("#statementClosingDay", "28");
  await page.fill("#paymentDueDay", "5");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Transferência: corrente -> poupança =====
  // Transferência agora é uma aba de novo lançamento (sem botão avulso na lista).
  await page.goto(`${BASE}/lancamentos/novo?aba=transferencia`);
  await page.waitForLoadState("networkidle");

  await page.selectOption("#from", { label: "Corrente" });
  await page.selectOption("#to", { label: "Poupança" });
  await page.fill("#amount", "1.200,00");
  await page.fill("#description", "Guardar");
  await page.click('button:has-text("Transferir")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  // Duas pernas ligadas por transferPairId.
  const pernas = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "transfer")));
  check("criou 2 pernas", pernas.length === 2, `${pernas.length}`);
  check("mesmas ligadas pelo par", pernas[0].transferPairId === pernas[1].transferPairId);
  check(
    "uma perna negativa (saída) e uma positiva (entrada)",
    pernas.some((p) => p.amount === -120000) && pernas.some((p) => p.amount === 120000),
    pernas.map((p) => p.amount).join(", "),
  );
  check("nenhuma tem categoria (não é receita/despesa)", true);

  // ===== Saldos: corrente caiu, poupança subiu =====
  check("corrente perdeu R$ 1.200 (5.000 -> 3.800)", (await saldo(ledgerId, "Corrente")) === 380000, `${await saldo(ledgerId, "Corrente")}`);
  check("poupança recebeu R$ 1.200 (0 -> 1.200)", (await saldo(ledgerId, "Poupança")) === 120000, `${await saldo(ledgerId, "Poupança")}`);

  // ===== Transferência NÃO conta como receita/despesa no resultado =====
  await page.goto(`${BASE}/lancamentos?mes=${new Date().toISOString().slice(0, 7)}`);
  await page.waitForLoadState("networkidle");
  // O resumo do mês só tem transferência, então Receitas e Despesas ficam zero.
  // O Intl usa espaço não-quebrável entre "R$" e o número; normaliza para casar.
  const resumo = ((await page.locator("text=Resultado").locator("..").textContent()) ?? "")
    .replace(/ /g, " ");
  check(
    "transferência não entra no resultado do mês",
    resumo.includes("R$ 0,00"),
    resumo.slice(0, 60),
  );

  // ===== Pagamento de fatura: usa o cartão primeiro =====
  // Gera saldo devedor no cartão com uma despesa.
  await page.goto(`${BASE}/lancamentos/novo`);
  await page.selectOption("#accountId", { label: "Cartão" });
  await page.fill("#amount", "800,00");
  await page.fill("#description", "Compra no cartão");
  await page.selectOption('select[aria-label="Categoria 1"]', { label: "Alimentação › Supermercado" });
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  // Paga a fatura: corrente -> cartão.
  await page.goto(`${BASE}/transferencias/nova?tipo=fatura`);
  await page.waitForLoadState("networkidle");
  check(
    "tela de fatura tem título próprio",
    await page.getByText("Pagar fatura do cartão").isVisible(),
  );
  await page.fill("#amount", "800,00");
  await page.click('button:has-text("Registrar pagamento")');
  await page.waitForURL(`${BASE}/lancamentos`, { timeout: 20000 });

  const [devedor] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.type, "transfer"),
        eq(transactions.amount, 80000),
      ),
    );
  check("pagamento gerou a perna de crédito no cartão", !!devedor);

  // Cartão: -800 (compra) +800 (pagamento) = 0.
  check("pagamento zerou o saldo devedor do cartão", (await saldo(ledgerId, "Cartão")) === 0, `${await saldo(ledgerId, "Cartão")}`);
  // Corrente: 3.800 - 800 = 3.000.
  check("pagamento saiu da corrente (3.800 -> 3.000)", (await saldo(ledgerId, "Corrente")) === 300000, `${await saldo(ledgerId, "Corrente")}`);

  // ===== Apagar transferência remove as duas pernas =====
  await page.goto(`${BASE}/lancamentos`);
  await page.waitForLoadState("networkidle");
  page.on("dialog", (d) => d.accept());
  const antes = (await db.select().from(transactions).where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "transfer")))).length;
  await page.locator('button[aria-label*="Apagar transferência Guardar"]').first().click();
  await page.waitForTimeout(1800);
  const depois = (await db.select().from(transactions).where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.type, "transfer")))).length;
  check("apagar removeu as 2 pernas de uma vez", depois === antes - 2, `${antes} -> ${depois}`);

  await page.screenshot({ path: "scripts/transferencia.png", fullPage: true });
  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
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
