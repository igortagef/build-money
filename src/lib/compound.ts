/**
 * Juros compostos com aportes mensais.
 *
 * Tudo em centavos inteiros, como o resto do app. O cálculo é iterativo (mês
 * a mês, arredondando o saldo a cada mês) em vez da fórmula fechada: é mais
 * fiel a como um investimento rende de verdade e evita que a projeção mostre
 * frações de centavo que nunca existiriam num extrato.
 *
 * Convenção: no mês, primeiro rende sobre o saldo, depois entra o aporte.
 */

export type PontoProjecao = {
  mes: number; // 0 = início
  investido: number; // total aportado até aqui (centavos)
  saldo: number; // saldo com juros (centavos)
  juros: number; // saldo - investido (centavos)
};

export function projetar(
  inicialCentavos: number,
  aporteMensalCentavos: number,
  taxaMensal: number, // fração: 0.01 = 1% a.m.
  meses: number,
): PontoProjecao[] {
  const pontos: PontoProjecao[] = [
    {
      mes: 0,
      investido: inicialCentavos,
      saldo: inicialCentavos,
      juros: 0,
    },
  ];

  let saldo = inicialCentavos;
  let investido = inicialCentavos;

  for (let m = 1; m <= meses; m++) {
    saldo = Math.round(saldo * (1 + taxaMensal)) + aporteMensalCentavos;
    investido += aporteMensalCentavos;
    pontos.push({ mes: m, investido, saldo, juros: saldo - investido });
  }

  return pontos;
}

/** Resultado final de uma projeção, para os cartões de resumo. */
export function resumo(pontos: PontoProjecao[]) {
  const fim = pontos[pontos.length - 1];
  return {
    saldoFinal: fim.saldo,
    investido: fim.investido,
    juros: fim.juros,
    // Quanto os juros representam do total final.
    percentualJuros: fim.saldo > 0 ? Math.round((fim.juros / fim.saldo) * 100) : 0,
  };
}

/** Converte taxa anual (%) para a taxa mensal equivalente (fração). */
export function anualParaMensal(taxaAnualPct: number): number {
  return Math.pow(1 + taxaAnualPct / 100, 1 / 12) - 1;
}

/** Taxa mensal (%) direta para fração. */
export function mensalPctParaFracao(taxaMensalPct: number): number {
  return taxaMensalPct / 100;
}
