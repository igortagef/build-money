/** Rodar: npx tsx scripts/check-import.ts */
import {
  parseOFX,
  parseCSV,
  parseExtrato,
  valorParaCentavos,
  dataParaIso,
  chaveDedup,
} from "../src/lib/import-extrato";

let f = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) f++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

console.log("\n--- valorParaCentavos ---");
check("1.234,56 -> 123456", valorParaCentavos("1.234,56") === 123456);
check("1234.56 -> 123456", valorParaCentavos("1234.56") === 123456);
check("-50,00 -> -5000", valorParaCentavos("-50,00") === -5000);
check("R$ 10,00 -> 1000", valorParaCentavos("R$ 10,00") === 1000);
check("(123,45) é negativo", valorParaCentavos("(123,45)") === -12345);
check("1.000 (milhar sem decimal) -> 100000", valorParaCentavos("1.000") === 100000);
check("vazio -> null", valorParaCentavos("abc") === null);

console.log("\n--- dataParaIso ---");
check("OFX 20260718 -> 2026-07-18", dataParaIso("20260718") === "2026-07-18");
check("OFX com hora -> 2026-07-18", dataParaIso("20260718120000[-3:GMT]") === "2026-07-18");
check("ISO passa direto", dataParaIso("2026-07-18") === "2026-07-18");
check("dd/mm/aaaa -> ISO", dataParaIso("18/07/2026") === "2026-07-18");
check("d/m/aa -> ISO", dataParaIso("5/1/26") === "2026-01-05");
check("data inválida -> null", dataParaIso("xx") === null);

console.log("\n--- parseOFX ---");
const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260703120000[-3:GMT]<TRNAMT>-1200.00<FITID>ABC123<MEMO>Aluguel julho
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260705<TRNAMT>5000.00<FITID>DEF456<NAME>Salario
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const rOfx = parseOFX(ofx);
check("OFX lê 2 lançamentos", rOfx.length === 2, `${rOfx.length}`);
check("OFX despesa negativa", rOfx[0].amount === -120000 && rOfx[0].tipo === "expense");
check("OFX pega o MEMO", rOfx[0].descricao === "Aluguel julho");
check("OFX pega o FITID", rOfx[0].fitid === "ABC123");
check("OFX receita positiva", rOfx[1].amount === 500000 && rOfx[1].tipo === "income");
check("OFX usa NAME quando não há MEMO", rOfx[1].descricao === "Salario");
check("OFX data de caixa = data postada", rOfx[0].dataCaixa === rOfx[0].data);
check("OFX sem categoria", rOfx[0].categoria === null);

console.log("\n--- parseCSV (modelo completo: competência, pagamento, categoria) ---");
const modelo = `Data de competência;Data de pagamento;Descrição;Categoria;Valor
03/07/2026;10/08/2026;Supermercado;Alimentação › Supermercado;-350,90
05/07/2026;05/07/2026;Salário do mês;Salário líquido;5000,00`;
const rMod = parseCSV(modelo);
check("modelo lê 2 lançamentos", rMod.length === 2, `${rMod.length}`);
check("competência (data do fato)", rMod[0].data === "2026-07-03", rMod[0].data);
check("pagamento (data de caixa) separado", rMod[0].dataCaixa === "2026-08-10", `${rMod[0].dataCaixa}`);
check("categoria capturada do arquivo", rMod[0].categoria === "Alimentação › Supermercado", `${rMod[0].categoria}`);
check("valor da despesa negativo", rMod[0].amount === -35090 && rMod[0].tipo === "expense");
check("receita: pagamento = competência", rMod[1].dataCaixa === "2026-07-05");
check("receita: categoria capturada", rMod[1].categoria === "Salário líquido");
check("receita positiva", rMod[1].amount === 500000 && rMod[1].tipo === "income");

console.log("\n--- parseCSV simples (sem categoria/pagamento) ainda funciona ---");
const rSimp = parseCSV(`Data;Histórico;Valor\n03/07/2026;Aluguel;-1200,00`);
check("simples: 1 lançamento", rSimp.length === 1);
check("simples: sem categoria", rSimp[0].categoria === null);
check("simples: sem data de caixa", rSimp[0].dataCaixa === null);

console.log("\n--- parseCSV (com cabeçalho, ;) ---");
const csv = `Data;Histórico;Valor
03/07/2026;Aluguel julho;-1200,00
05/07/2026;Salário;5000,00
07/07/2026;Padaria;-15,50`;
const rCsv = parseCSV(csv);
check("CSV lê 3 lançamentos", rCsv.length === 3, `${rCsv.length}`);
check("CSV data convertida", rCsv[0].data === "2026-07-03");
check("CSV valor negativo", rCsv[0].amount === -120000);
check("CSV descrição", rCsv[0].descricao === "Aluguel julho");
check("CSV receita", rCsv[1].tipo === "income" && rCsv[1].amount === 500000);

console.log("\n--- parseCSV (vírgula como delimitador, valor com ponto) ---");
const csv2 = `date,description,amount
2026-07-03,Coffee,-4.50
2026-07-04,Refund,10.00`;
const rCsv2 = parseCSV(csv2);
check("CSV en-US lê 2", rCsv2.length === 2, `${rCsv2.length}`);
check("CSV en-US valor -450", rCsv2[0].amount === -450, `${rCsv2[0].amount}`);

console.log("\n--- parseCSV sem cabeçalho ---");
const csv3 = `03/07/2026;Mercado;-89,90
04/07/2026;Pix recebido;200,00`;
const rCsv3 = parseCSV(csv3);
check("CSV sem cabeçalho lê 2", rCsv3.length === 2, `${rCsv3.length}`);
check("CSV sem cabeçalho descrição certa", rCsv3[0].descricao === "Mercado");

console.log("\n--- parseExtrato detecta formato ---");
check("detecta OFX pelo conteúdo", parseExtrato(ofx).length === 2);
check("detecta CSV por padrão", parseExtrato(csv).length === 3);

console.log("\n--- chaveDedup ---");
check("usa FITID quando existe", chaveDedup(rOfx[0]) === "fitid:ABC123");
check(
  "deriva hash estável sem FITID",
  chaveDedup(rCsv[0]) === chaveDedup({ ...rCsv[0] }),
);
check(
  "hash difere quando o valor muda",
  chaveDedup(rCsv[0]) !== chaveDedup({ ...rCsv[0], amount: -1 }),
);

console.log(f === 0 ? "\nTudo passou.\n" : `\n${f} falharam.\n`);
process.exit(f === 0 ? 0 : 1);
