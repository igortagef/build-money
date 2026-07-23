/** Rodar: npx tsx scripts/check-juros.ts */
import { projetar, resumo, anualParaMensal } from "../src/lib/compound";

let f = 0;
function aprox(label: string, atual: number, esperado: number, tol = 100) {
  const ok = Math.abs(atual - esperado) <= tol;
  if (!ok) f++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label} — obtido ${atual}, esperado ~${esperado}`);
}
function check(label: string, cond: boolean, extra = "") {
  if (!cond) f++;
  console.log(`${cond ? "ok   " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
}

console.log("\n--- sem juros: só soma dos aportes ---");
{
  const p = projetar(100000, 10000, 0, 12); // 1.000 inicial + 100/mês, 0%
  const r = resumo(p);
  aprox("saldo = 1.000 + 100*12 = 2.200", r.saldoFinal, 220000, 0);
  aprox("investido = 2.200", r.investido, 220000, 0);
  aprox("juros = 0", r.juros, 0, 0);
}

console.log("\n--- só aporte inicial, juros compostos ---");
{
  // 1.000 a 1% a.m. por 12 meses = 1.000 * 1.01^12 ≈ 1.126,83
  const p = projetar(100000, 0, 0.01, 12);
  const r = resumo(p);
  aprox("1.000 a 1% a.m. por 12m ≈ 1.126,83", r.saldoFinal, 112683, 50);
  aprox("investido continua 1.000", r.investido, 100000, 0);
}

console.log("\n--- aportes mensais com juros ---");
{
  // 0 inicial + 100/mês a 1% a.m. por 12 meses
  // FV = 100 * ((1.01^12 - 1)/0.01) ≈ 1.268,25
  const p = projetar(0, 10000, 0.01, 12);
  const r = resumo(p);
  aprox("100/mês a 1% por 12m ≈ 1.268", r.saldoFinal, 126825, 200);
  aprox("investido = 1.200", r.investido, 120000, 0);
  check("juros > 0", r.juros > 0, `${r.juros}`);
}

console.log("\n--- estrutura da projeção ---");
{
  const p = projetar(50000, 5000, 0.005, 24);
  check("tem ponto inicial (mês 0)", p[0].mes === 0 && p[0].saldo === 50000);
  check("tem 25 pontos (0..24)", p.length === 25, `${p.length}`);
  check("saldo cresce mês a mês", p[24].saldo > p[12].saldo && p[12].saldo > p[1].saldo);
  check("juros = saldo - investido em cada ponto", p.every((x) => x.juros === x.saldo - x.investido));
}

console.log("\n--- conversão de taxa anual ---");
{
  // 12,68% a.a. ≈ 1% a.m. (pois 1.01^12 ≈ 1.1268)
  const mensal = anualParaMensal(12.6825);
  aprox("12,68% a.a. ≈ 1% a.m.", Math.round(mensal * 1e6), 10000, 50);
}

console.log("\n--- comparação de cenários ---");
{
  const conservador = resumo(projetar(1000000, 50000, anualParaMensal(8), 120));
  const arrojado = resumo(projetar(1000000, 50000, anualParaMensal(14), 120));
  check("cenário de maior taxa rende mais", arrojado.saldoFinal > conservador.saldoFinal,
    `${conservador.saldoFinal} vs ${arrojado.saldoFinal}`);
  check("ambos investem o mesmo", conservador.investido === arrojado.investido);
}

console.log(f === 0 ? "\nTudo passou.\n" : `\n${f} falharam.\n`);
process.exit(f === 0 ? 0 : 1);
