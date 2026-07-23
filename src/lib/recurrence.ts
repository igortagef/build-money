import type { RecurrenceFrequency } from "@/db/schema";

/**
 * Cálculo das ocorrências de uma conta fixa.
 *
 * Datas aqui são strings ISO ("2026-07-31") e nunca objetos Date convertidos
 * de/para UTC: uma conta que vence dia 31 precisa vencer dia 31 no fuso do
 * usuário, e a viagem por UTC facilmente empurra isso para o dia 30 ou 1º.
 */

export type Regra = {
  frequency: RecurrenceFrequency;
  /** Dia do vencimento (1-31). Só vale nas frequências mensais ou maiores. */
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
};

/** Quantos meses cada frequência avança. Semanais não usam isto. */
const PASSO_EM_MESES: Partial<Record<RecurrenceFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const FREQUENCIA_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: "Toda semana",
  biweekly: "A cada 15 dias",
  monthly: "Todo mês",
  quarterly: "A cada 3 meses",
  semiannual: "A cada 6 meses",
  annual: "Uma vez por ano",
};

function ultimoDiaDoMes(ano: number, mesIdx: number): number {
  return new Date(ano, mesIdx + 1, 0).getDate();
}

function iso(ano: number, mesIdx: number, dia: number): string {
  return `${ano}-${String(mesIdx + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split("-").map(Number);
  return [a, m - 1, d];
}

/** Soma dias a uma data ISO, sem passar por fuso horário. */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = partes(data);
  const base = new Date(Date.UTC(a, m, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return iso(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
}

/**
 * Soma meses mantendo o dia do vencimento.
 *
 * O ponto delicado: uma conta que vence dia 31 não pode "escorregar" para o
 * dia 1º do mês seguinte em fevereiro — ela vence no último dia. E o mês
 * seguinte precisa voltar para o 31, e não ficar preso no 28: por isso o dia
 * desejado é sempre recalculado a partir da regra, nunca da data anterior.
 */
export function somarMeses(data: string, meses: number, diaDesejado: number): string {
  const [a, m] = partes(data);
  const total = m + meses;
  const ano = a + Math.floor(total / 12);
  const mesIdx = ((total % 12) + 12) % 12;
  const dia = Math.min(diaDesejado, ultimoDiaDoMes(ano, mesIdx));
  return iso(ano, mesIdx, dia);
}

/** A primeira ocorrência: a partir da data de início, no dia do vencimento. */
export function primeiraOcorrencia(regra: Regra): string {
  const { frequency, dayOfMonth, startDate } = regra;

  if (frequency === "weekly" || frequency === "biweekly" || !dayOfMonth) {
    return startDate;
  }

  const [a, m, d] = partes(startDate);
  const diaNoMes = Math.min(dayOfMonth, ultimoDiaDoMes(a, m));

  // Se o dia do vencimento já passou no mês de início, a primeira cobrança
  // é no mês seguinte — cobrar retroativo criaria uma dívida que não existe.
  if (diaNoMes >= d) return iso(a, m, diaNoMes);

  return somarMeses(iso(a, m, 1), 1, dayOfMonth);
}

/** A ocorrência seguinte a uma data já materializada. */
export function proximaOcorrencia(regra: Regra, atual: string): string {
  switch (regra.frequency) {
    case "weekly":
      return somarDias(atual, 7);
    case "biweekly":
      return somarDias(atual, 14);
    default: {
      const passo = PASSO_EM_MESES[regra.frequency] ?? 1;
      // O dia desejado vem da regra, não de `atual`: se fevereiro cortou o
      // vencimento para 28, março tem que voltar para 31.
      const dia = regra.dayOfMonth ?? partes(regra.startDate)[2];
      return somarMeses(atual, passo, dia);
    }
  }
}

/**
 * Todas as ocorrências de uma regra dentro de uma janela.
 *
 * @param depoisDe Última data já gerada; a lista começa DEPOIS dela. Nulo
 *                 significa que a regra nunca gerou nada.
 * @param ate      Horizonte: não gera além disso.
 */
export function ocorrencias(
  regra: Regra,
  depoisDe: string | null,
  ate: string,
): string[] {
  const saida: string[] = [];

  let atual = depoisDe
    ? proximaOcorrencia(regra, depoisDe)
    : primeiraOcorrencia(regra);

  // Trava de segurança: uma regra malformada não pode virar laço infinito
  // gerando lançamentos no banco do usuário.
  let voltas = 0;
  const LIMITE = 500;

  while (atual <= ate && voltas < LIMITE) {
    if (regra.endDate && atual > regra.endDate) break;
    saida.push(atual);
    atual = proximaOcorrencia(regra, atual);
    voltas++;
  }

  return saida;
}

/** Horizonte padrão: quantos meses à frente as contas fixas são provisionadas. */
export const MESES_DE_PROVISAO = 12;

export function horizonte(hoje = new Date(), meses = MESES_DE_PROVISAO): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1);
  // Último dia do mês do horizonte, para não cortar o mês pela metade.
  return iso(d.getFullYear(), d.getMonth(), ultimoDiaDoMes(d.getFullYear(), d.getMonth()));
}
