import { somarMeses } from "./recurrence";

/**
 * Competência x caixa.
 *
 * Uma compra no cartão em 20/07 com fatura fechando dia 28 e vencendo dia 5
 * é DESPESA DE JULHO (competência: foi quando você consumiu), mas o dinheiro
 * só sai em 05/08 (caixa). Os dois números são certos; respondem perguntas
 * diferentes:
 *
 *   competência -> "quanto eu gastei em julho?"
 *   caixa       -> "quanto saiu da minha conta em agosto?"
 *
 * Sem essa distinção, um mês com muita compra parcelada parece ótimo (pouco
 * dinheiro saiu) enquanto a dívida cresce. É o erro clássico de controle
 * financeiro pessoal.
 */

/** Último dia do mês — o dia 31 não existe em fevereiro. */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

function iso(ano: number, mes: number, dia: number): string {
  const d = Math.min(dia, ultimoDiaDoMes(ano, mes));
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Data em que uma compra no cartão vira dinheiro saindo da conta.
 *
 * @param dataCompra   data da compra (competência), ISO
 * @param diaFechamento dia do mês em que a fatura fecha
 * @param diaVencimento dia do mês em que a fatura vence
 */
export function dataDePagamentoDaFatura(
  dataCompra: string,
  diaFechamento: number,
  diaVencimento: number,
): string {
  const [ano, mes, dia] = dataCompra.split("-").map(Number);
  const mesIdx = mes - 1;

  // Comprou depois do fechamento? Entra na fatura do mês seguinte.
  const entraNoProximoCiclo = dia > diaFechamento;

  // Mês em que a fatura que contém esta compra fecha.
  let mesFechamento = mesIdx + (entraNoProximoCiclo ? 1 : 0);
  let anoFechamento = ano;
  if (mesFechamento > 11) {
    mesFechamento -= 12;
    anoFechamento += 1;
  }

  // O vencimento cai depois do fechamento. Se o dia do vencimento é menor ou
  // igual ao do fechamento (ex.: fecha 28, vence 5), é no mês seguinte ao
  // fechamento; senão (ex.: fecha 5, vence 15), é no mesmo mês.
  const vencimentoNoMesSeguinte = diaVencimento <= diaFechamento;

  let mesVencimento = mesFechamento + (vencimentoNoMesSeguinte ? 1 : 0);
  let anoVencimento = anoFechamento;
  if (mesVencimento > 11) {
    mesVencimento -= 12;
    anoVencimento += 1;
  }

  return iso(anoVencimento, mesVencimento, diaVencimento);
}

/**
 * Inverso de `dataDePagamentoDaFatura`: dado o VENCIMENTO de uma fatura (que é
 * a data de caixa das compras do ciclo) e a configuração do cartão, devolve a
 * data em que essa fatura FECHOU. Usado para mostrar o período de cada fatura
 * e para saber se ela já deveria estar fechada.
 */
export function dataDeFechamentoDaFatura(
  dataVencimento: string,
  diaFechamento: number,
  diaVencimento: number,
): string {
  const [ano, mes] = dataVencimento.split("-").map(Number);
  const mesIdx = mes - 1;

  // Se o vencimento cai no mês seguinte ao fechamento (ex.: fecha 28, vence 5),
  // a fatura fechou no mês anterior ao vencimento; senão, no mesmo mês.
  const vencimentoNoMesSeguinte = diaVencimento <= diaFechamento;

  let mesFechamento = mesIdx - (vencimentoNoMesSeguinte ? 1 : 0);
  let anoFechamento = ano;
  if (mesFechamento < 0) {
    mesFechamento += 12;
    anoFechamento -= 1;
  }

  return iso(anoFechamento, mesFechamento, diaFechamento);
}

/**
 * Período coberto por uma fatura, a partir da sua data de fechamento: do dia
 * seguinte ao fechamento anterior até o fechamento atual (inclusive).
 */
export function periodoDaFatura(dataFechamento: string): {
  inicio: string;
  fim: string;
} {
  const [ano, mes, dia] = dataFechamento.split("-").map(Number);
  const mesIdx = mes - 1;

  // Fechamento do ciclo anterior: mesmo dia, um mês antes (cortado em meses
  // curtos). O período começa no dia seguinte a ele.
  const anterior = new Date(ano, mesIdx - 1, Math.min(dia, ultimoDiaDoMes(ano, mesIdx - 1 < 0 ? 11 : mesIdx - 1)));
  anterior.setDate(anterior.getDate() + 1);
  const inicio = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, "0")}-${String(anterior.getDate()).padStart(2, "0")}`;

  return { inicio, fim: dataFechamento };
}

/**
 * Data de caixa de um lançamento qualquer.
 * Fora do cartão, competência e caixa coincidem: você paga na hora.
 */
export function calcularDataDeCaixa(
  dataCompetencia: string,
  conta: {
    type: string;
    statementClosingDay: number | null;
    paymentDueDay: number | null;
  },
): string {
  if (
    conta.type !== "credit_card" ||
    !conta.statementClosingDay ||
    !conta.paymentDueDay
  ) {
    return dataCompetencia;
  }

  return dataDePagamentoDaFatura(
    dataCompetencia,
    conta.statementClosingDay,
    conta.paymentDueDay,
  );
}

/**
 * Vencimentos de fatura candidatos para uma compra: o automático (sugerido) e
 * alguns vizinhos. Serve para o usuário CORRIGIR o ciclo quando o banco lançou a
 * compra numa fatura diferente da calculada (comum perto do fechamento ou quando
 * a loja processa com atraso). Fonte única para o seletor (cliente) e a
 * validação (servidor), então o valor escolhido sempre é um dos daqui.
 */
export function faturasCandidatas(
  dataCompra: string,
  diaFechamento: number,
  diaVencimento: number,
  antes = 1,
  depois = 2,
): { dueDate: string; auto: boolean }[] {
  const auto = dataDePagamentoDaFatura(dataCompra, diaFechamento, diaVencimento);
  const lista: { dueDate: string; auto: boolean }[] = [];
  for (let i = -antes; i <= depois; i++) {
    lista.push({ dueDate: somarMeses(auto, i, diaVencimento), auto: i === 0 });
  }
  return lista;
}

/**
 * Data de caixa de uma compra, considerando uma fatura escolhida pelo usuário.
 * Sem escolha (ou fora do cartão), cai no cálculo automático. A escolha só vale
 * se for um dos vencimentos candidatos — assim um POST não injeta data qualquer.
 */
export function resolverDataDeCaixa(
  dataCompetencia: string,
  conta: {
    type: string;
    statementClosingDay: number | null;
    paymentDueDay: number | null;
  },
  faturaEscolhida?: string | null,
): string {
  const auto = calcularDataDeCaixa(dataCompetencia, conta);
  if (
    !faturaEscolhida ||
    conta.type !== "credit_card" ||
    !conta.statementClosingDay ||
    !conta.paymentDueDay
  ) {
    return auto;
  }
  const candidatos = faturasCandidatas(
    dataCompetencia,
    conta.statementClosingDay,
    conta.paymentDueDay,
  ).map((f) => f.dueDate);
  return candidatos.includes(faturaEscolhida) ? faturaEscolhida : auto;
}

export type Regime = "competencia" | "caixa";

export const REGIME_LABEL: Record<Regime, string> = {
  competencia: "Competência",
  caixa: "Caixa",
};

export const REGIME_EXPLICACAO: Record<Regime, string> = {
  competencia: "Quando o gasto aconteceu, mesmo que você pague depois.",
  caixa: "Quando o dinheiro sai da conta — a fatura do cartão conta no vencimento.",
};
