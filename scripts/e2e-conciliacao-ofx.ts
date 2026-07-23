/**
 * Conciliação com extrato OFX: importar sem criar lançamento, casar par
 * sugerido, criar-e-conciliar quando não há par, e arquivar.
 * Rodar (dev server no ar): npx tsx --env-file=.env.local scripts/e2e-conciliacao-ofx.ts
 */
import { chromium } from "playwright";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  users, ledgers, accounts, categories, transactions, transactionSplits, bankStatementLines,
} from "../src/db/schema";

const BASE = "http://localhost:3000";
const email = `ofx-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

// Três linhas: uma casa com lançamento existente, duas não.
const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260710<TRNAMT>-300.00<FITID>A1<MEMO>Aluguel julho
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260712<TRNAMT>-45.50<FITID>A2<MEMO>UBER TRIP SP
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260713<TRNAMT>-88.00<FITID>A3<MEMO>TARIFA BANCARIA
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "ofx-"));
  const arq = join(dir, "extrato.ofx");
  writeFileSync(arq, OFX, "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "OFX Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense")))
    .limit(1);

  const [conta] = await db
    .insert(accounts)
    .values({ ledgerId, name: "Corrente", type: "checking", currency: "BRL", openingBalance: 100000 })
    .returning({ id: accounts.id });

  // Lançamento que deve casar com a primeira linha do extrato.
  const [tx] = await db
    .insert(transactions)
    .values({
      ledgerId, accountId: conta.id, type: "expense", status: "cleared",
      amount: 30000, currency: "BRL", amountBase: 30000,
      description: "Aluguel julho", date: "2026-07-10",
    })
    .returning({ id: transactions.id });
  await db.insert(transactionSplits).values({
    transactionId: tx.id, categoryId: cat.id, amount: 30000, amountBase: 30000, sortOrder: 0,
  });

  const antes = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));

  // ===== Importar o extrato =====
  await page.goto(`${BASE}/conciliacao/${conta.id}/extrato`);
  await page.waitForLoadState("networkidle");
  await page.setInputFiles('input[type="file"]', arq);
  await page.getByRole("button", { name: /Importar para conciliar/ }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });
  check("importa as 3 linhas", await page.getByText(/3 linha\(s\) importada/).isVisible());

  const depois = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("importar NÃO cria lançamento", depois.length === antes.length, `${antes.length} -> ${depois.length}`);

  const linhas = await db.select().from(bankStatementLines).where(eq(bankStatementLines.ledgerId, ledgerId));
  check("3 linhas na área de espera", linhas.length === 3, `${linhas.length}`);

  // ===== Par sugerido =====
  await page.reload();
  await page.waitForLoadState("networkidle");
  check("sugere o par do aluguel", await page.getByText(/Par encontrado|Par provável/).first().isVisible());

  await page.getByRole("button", { name: /^Conciliar$/ }).first().click();
  await page.waitForTimeout(1500);
  const [txDb] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
  check("conciliar marca o lançamento como conferido", txDb.status === "reconciled", txDb.status);

  // ===== Criar e conciliar (sem par) =====
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Criar e conciliar/ }).first().click();
  await page.waitForTimeout(1800);
  const criados = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("criar e conciliar gera o lançamento", criados.length === antes.length + 1, `${criados.length}`);
  const novo = criados.find((t) => t.id !== tx.id);
  check("lançamento criado já nasce conferido", novo?.status === "reconciled", novo?.status ?? "?");

  // ===== Arquivar a última =====
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Arquivar/ }).first().click();
  await page.waitForTimeout(1500);
  const arquivadas = await db
    .select().from(bankStatementLines)
    .where(and(eq(bankStatementLines.ledgerId, ledgerId), eq(bankStatementLines.status, "arquivada")));
  check("arquivar tira a linha da fila", arquivadas.length === 1, `${arquivadas.length}`);

  // ===== Reimportar não duplica =====
  await page.setInputFiles('input[type="file"]', arq);
  await page.getByRole("button", { name: /Importar para conciliar/ }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });
  const total = await db.select().from(bankStatementLines).where(eq(bankStatementLines.ledgerId, ledgerId));
  check("reimportar o mesmo extrato não duplica", total.length === 3, `${total.length}`);

  const errosReais = erros.filter((e) => !e.includes("hydrat") && !e.includes("caret-color"));
  check("nenhum erro de console", errosReais.length === 0, errosReais.slice(0, 2).join(" | "));

  await browser.close();
  await db.delete(bankStatementLines).where(eq(bankStatementLines.ledgerId, ledgerId));
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
    await db.delete(bankStatementLines).where(eq(bankStatementLines.ledgerId, u.defaultLedgerId!));
    await db.delete(transactions).where(eq(transactions.ledgerId, u.defaultLedgerId!));
    await db.delete(ledgers).where(eq(ledgers.ownerId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  process.exit(1);
});
