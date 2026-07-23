/**
 * Importação de extrato sem IA: sobe um OFX, confere o preview, grava, e
 * reimporta o mesmo arquivo para provar que nada duplica.
 * Rodar: npx tsx --env-file=.env.local scripts/e2e-importar.ts
 */
import { chromium } from "playwright";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { db } from "../src/db";
import { users, ledgers, transactions, transactionSplits } from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import { readFileSync } from "fs";

const BASE = "http://localhost:3000";
const email = `imp-${Date.now()}@teste.local`;

let falhas = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260703120000[-3:GMT]<TRNAMT>-1200.00<FITID>ALUG202607<MEMO>Aluguel julho
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260705<TRNAMT>-89.90<FITID>MERC0705<MEMO>Supermercado Dia
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260705<TRNAMT>5000.00<FITID>SAL202607<NAME>Salario ACME
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "imp-"));
  const arquivo = join(dir, "extrato.ofx");
  writeFileSync(arquivo, OFX, "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await page.goto(`${BASE}/cadastrar`);
  await page.fill("#name", "Imp Teste");
  await page.fill("#email", email);
  await page.fill("#password", "senha-de-teste-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/", { timeout: 20000 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ledgerId = u.defaultLedgerId!;

  await page.goto(`${BASE}/contas/nova`);
  await page.fill("#name", "Corrente");
  await page.fill("#openingBalance", "0,00");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/contas`, { timeout: 20000 });

  // ===== Primeira importação =====
  await page.goto(`${BASE}/lancamentos/importar`);
  await page.waitForLoadState("networkidle");
  await page.setInputFiles('input[type="file"]', arquivo);
  await page.getByRole("button", { name: /Analisar arquivo/ }).click();

  await page.getByText("Confira antes de gravar").waitFor({ timeout: 15000 });
  check("preview mostra o aluguel", await page.getByText("Aluguel julho", { exact: true }).isVisible());
  check("preview mostra o salário", await page.getByText("Salario ACME", { exact: true }).isVisible());
  check("preview mostra 3 novos", await page.getByText("3 novo(s)").isVisible());
  check("valor de despesa aparece negativo", await page.getByText("−").first().isVisible());

  // Atribui categoria padrão às despesas.
  await page.selectOption("#imp-cat-desp", { label: "Moradia › Aluguel" });

  await page.getByRole("button", { name: /Importar .*lançamento/ }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });
  check("confirma 3 importados", await page.getByText("3 lançamento(s) importado(s)").isVisible());

  const apos1 = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("banco tem 3 lançamentos", apos1.length === 3, `${apos1.length}`);
  check("todos com external_id", apos1.every((t) => t.externalId), apos1.map((t) => t.externalId).join(","));

  // ===== Reimportação do mesmo arquivo: deve detectar tudo como duplicado =====
  await page.goto(`${BASE}/lancamentos/importar`);
  await page.waitForLoadState("networkidle");
  await page.setInputFiles('input[type="file"]', arquivo);
  await page.getByRole("button", { name: /Analisar arquivo/ }).click();
  await page.getByText("Confira antes de gravar").waitFor({ timeout: 15000 });
  check("reimportação marca 3 como já existentes", await page.getByText("3 já existe(m)").isVisible());

  // Nenhum selecionado por padrão (todos são duplicados) -> botão desabilitado.
  const btnDisabled = await page.getByRole("button", { name: /Importar/ }).isDisabled();
  check("botão de importar fica desabilitado sem seleção", btnDisabled);

  // Força incluir todos e grava: a trava do banco não deixa duplicar.
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: /Importar/ }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });
  check("reimportação ignora as 3 duplicadas", await page.getByText("3 já existiam").isVisible());

  const apos2 = await db.select().from(transactions).where(eq(transactions.ledgerId, ledgerId));
  check("banco continua com 3 (nada duplicou)", apos2.length === 3, `${apos2.length}`);

  // ===== Importação por planilha (modelo): categoria e datas de competência/caixa =====
  const csvArq = join(dir, "planilha.csv");
  writeFileSync(
    csvArq,
    `Data de competência;Data de pagamento;Descrição;Categoria;Valor
02/07/2026;05/08/2026;Aluguel importado;Aluguel;-1500,00
04/07/2026;04/07/2026;Bonus recebido;Salário líquido;800,00`,
    "utf8",
  );

  await page.goto(`${BASE}/lancamentos/importar`);
  await page.waitForLoadState("networkidle");
  await page.setInputFiles('input[type="file"]', csvArq);
  await page.getByRole("button", { name: /Analisar arquivo/ }).click();
  await page.getByText("Confira antes de gravar").waitFor({ timeout: 15000 });
  const tabelaPreview = page.locator("table").last();
  check("preview reconhece a categoria do arquivo", await tabelaPreview.getByText("Moradia › Aluguel").first().isVisible());
  check("preview mostra a data de pagamento (caixa)", await tabelaPreview.getByText("05/08/2026").first().isVisible());

  await page.getByRole("button", { name: /Importar/ }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });
  check("importou com categoria preenchida", await page.getByText(/com categoria preenchida/).isVisible());

  const [txAluguel] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.description, "Aluguel importado")));
  check("competência gravada", txAluguel?.date === "2026-07-02", `${txAluguel?.date}`);
  check("data de caixa = pagamento do arquivo", txAluguel?.settlementDate === "2026-08-05", `${txAluguel?.settlementDate}`);
  const splitsAluguel = await db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, txAluguel.id));
  check("lançamento recebeu rateio da categoria do arquivo", splitsAluguel.length === 1, `${splitsAluguel.length}`);

  // ===== Modelo para baixar =====
  const dlModelo = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("link", { name: /Baixar modelo/ }).click(),
  ]).then(([d]) => d);
  const camModelo = await dlModelo.path();
  const csvModelo = camModelo ? readFileSync(camModelo, "utf8") : "";
  check(
    "modelo tem as colunas de competência, pagamento e categoria",
    csvModelo.includes("Data de competência") && csvModelo.includes("Data de pagamento") && csvModelo.includes("Categoria"),
  );

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
