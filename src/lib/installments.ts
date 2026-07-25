import { splitEvenly } from "./money";
import { somarMeses } from "./recurrence";
import { calcularDataDeCaixa } from "./statement";

/**
 * Geração das parcelas de uma compra parcelada.
 *
 * Uma decisão de modelagem que vale explicar: cada parcela é uma despesa no
 * SEU mês, não tudo no mês da compra.
 *
 * Contabilmente, uma compra parcelada teria a competência inteira na data da
 * compra. Mas para controle pessoal isso engana: "geladeira em 12x de R$ 100"
 * apareceria como R$ 1.200 num mês e zero nos outros onze, quando o que pesa
 * no bolso é R$ 100 por mês. Distribuir cada parcela no seu mês responde a
 * pergunta que o usuário faz — "quanto vou pagar em agosto?".
 *
 * O caixa segue a mesma ideia, mas no cartão respeita o vencimento da fatura:
 * a parcela de agosto sai da conta quando a fatura de agosto vence.
 */

export type Conta = {
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

export type Parcela = {
  numero: number; // 1..N
  data: string; // competência: o mês em que a parcela pesa
  dataCaixa: string; // quando o dinheiro sai (no cartão, o vencimento da fatura)
  valor: number; // em centavos; a soma das parcelas fecha com o total
};

/**
 * @param totalCentavos valor total da compra
 * @param parcelas      número de parcelas (>= 1)
 * @param primeiraData  vencimento nominal da primeira parcela (ISO)
 * @param conta         para calcular a data de caixa no cartão
 */
export function gerarParcelas(
  totalCentavos: number,
  parcelas: number,
  primeiraData: string,
  conta: Conta,
): Parcela[] {
  if (parcelas < 1) throw new Error("parcelas precisa ser >= 1");

  // splitEvenly distribui o resto nas primeiras: a soma bate com o total,
  // sem o clássico "R$ 100,00 em 3 = R$ 33,33 x 3 = R$ 99,99".
  const valores = splitEvenly(totalCentavos, parcelas);
  const [, , dia] = primeiraData.split("-").map(Number);

  // Caixa da 1ª parcela: no cartão, o vencimento da fatura que a contém. As
  // demais caem UMA fatura por mês a partir dela — por isso somamos meses ao
  // caixa da primeira, em vez de recalcular `calcularDataDeCaixa` sobre a
  // competência de cada parcela. Esse recálculo sobre a data sintética colidia
  // em fevereiro (dia cortado) e quando o dia da compra passava do fechamento,
  // jogando duas parcelas na MESMA fatura e pulando um mês.
  const primeiraCaixa = calcularDataDeCaixa(primeiraData, conta);
  const [, , diaCaixa] = primeiraCaixa.split("-").map(Number);

  return valores.map((valor, i) => {
    // Mantém o dia do vencimento mês a mês, cortando em meses curtos.
    const data = i === 0 ? primeiraData : somarMeses(primeiraData, i, dia);
    const dataCaixa = i === 0 ? primeiraCaixa : somarMeses(primeiraCaixa, i, diaCaixa);
    return { numero: i + 1, data, dataCaixa, valor };
  });
}

/** Rótulo curto de parcela para listas: "3/12". */
export function rotuloParcela(numero: number, total: number): string {
  return `${numero}/${total}`;
}
