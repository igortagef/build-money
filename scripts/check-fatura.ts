/** Rodar: npx tsx scripts/check-fatura.ts */
import {
  dataDePagamentoDaFatura,
  calcularDataDeCaixa,
  dataDeFechamentoDaFatura,
  periodoDaFatura,
} from "../src/lib/statement";

let f = 0;
function check(label: string, atual: string, esperado: string) {
  const ok = atual === esperado;
  if (!ok) f++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}\n        esperado ${esperado} | obtido ${atual}`);
}

console.log("\n--- Cartão: fecha dia 28, vence dia 5 (vencimento no mês seguinte) ---");
check("compra 20/07 -> fatura fecha 28/07, paga 05/08", dataDePagamentoDaFatura("2026-07-20", 28, 5), "2026-08-05");
check("compra 28/07 (no dia do fechamento) -> ainda entra, paga 05/08", dataDePagamentoDaFatura("2026-07-28", 28, 5), "2026-08-05");
check("compra 29/07 (depois de fechar) -> próxima fatura, paga 05/09", dataDePagamentoDaFatura("2026-07-29", 28, 5), "2026-09-05");
check("compra 01/07 -> paga 05/08", dataDePagamentoDaFatura("2026-07-01", 28, 5), "2026-08-05");

console.log("\n--- Virada de ano ---");
check("compra 15/12 -> paga 05/01 do ano seguinte", dataDePagamentoDaFatura("2026-12-15", 28, 5), "2027-01-05");
check("compra 30/12 (após fechar) -> paga 05/02", dataDePagamentoDaFatura("2026-12-30", 28, 5), "2027-02-05");

console.log("\n--- Cartão: fecha dia 5, vence dia 15 (vencimento no mesmo mês) ---");
check("compra 02/07 -> fecha 05/07, paga 15/07", dataDePagamentoDaFatura("2026-07-02", 5, 15), "2026-07-15");
check("compra 10/07 (após fechar) -> paga 15/08", dataDePagamentoDaFatura("2026-07-10", 5, 15), "2026-08-15");

console.log("\n--- Meses curtos: dia que não existe ---");
// Fechamento 20, vencimento 31: como 31 > 20, o vencimento é no MESMO mês.
// Compra em fevereiro fecha 20/02 e venceria 31/02 — data que não existe.
check("vencimento 31 em fevereiro vira 28", dataDePagamentoDaFatura("2026-02-10", 20, 31), "2026-02-28");
check("fevereiro bissexto (2028) vira 29", dataDePagamentoDaFatura("2028-02-10", 20, 31), "2028-02-29");
check("vencimento 31 em abril vira 30", dataDePagamentoDaFatura("2026-04-10", 20, 31), "2026-04-30");
// Fechamento 25, vencimento 10: vencimento no mês seguinte, e fevereiro é curto.
check("fecha 25/01, vence 10/02", dataDePagamentoDaFatura("2026-01-20", 25, 10), "2026-02-10");
check("compra 31/01 (após fechar) -> vence 10/03", dataDePagamentoDaFatura("2026-01-31", 25, 10), "2026-03-10");

console.log("\n--- Fora do cartão, competência = caixa ---");
check(
  "conta corrente paga na hora",
  calcularDataDeCaixa("2026-07-20", { type: "checking", statementClosingDay: null, paymentDueDay: null }),
  "2026-07-20",
);
check(
  "cartão sem fechamento configurado não inventa data",
  calcularDataDeCaixa("2026-07-20", { type: "credit_card", statementClosingDay: null, paymentDueDay: null }),
  "2026-07-20",
);
check(
  "cartão configurado adia para o vencimento",
  calcularDataDeCaixa("2026-07-20", { type: "credit_card", statementClosingDay: 28, paymentDueDay: 5 }),
  "2026-08-05",
);

console.log("\n--- Fechamento a partir do vencimento (inverso) ---");
check("vence 05/08 -> fechou 28/07", dataDeFechamentoDaFatura("2026-08-05", 28, 5), "2026-07-28");
check("vence 15/07 -> fechou 05/07 (mesmo mês)", dataDeFechamentoDaFatura("2026-07-15", 5, 15), "2026-07-05");
check("vence 05/01 -> fechou 28/12 do ano anterior", dataDeFechamentoDaFatura("2027-01-05", 28, 5), "2026-12-28");

console.log("\n--- Ida e volta: pagamento -> fechamento reconstrói o ciclo ---");
for (const [compra, fc, vc] of [
  ["2026-07-20", 28, 5],
  ["2026-07-02", 5, 15],
  ["2026-12-30", 28, 5],
] as const) {
  const venc = dataDePagamentoDaFatura(compra, fc, vc);
  const fech = dataDeFechamentoDaFatura(venc, fc, vc);
  const p = periodoDaFatura(fech);
  // A compra tem de cair dentro do período coberto pela fatura em que entrou.
  const dentro = compra > p.inicio && compra <= p.fim;
  if (!dentro) f++;
  console.log(`${dentro ? "ok   " : "FALHA"} compra ${compra} cai no período ${p.inicio}..${p.fim} (fecha ${fech}, vence ${venc})`);
}

console.log(f === 0 ? "\nTudo passou.\n" : `\n${f} falharam.\n`);
process.exit(f === 0 ? 0 : 1);
