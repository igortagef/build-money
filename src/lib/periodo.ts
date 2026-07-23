import type { Regime } from "./statement";

/** Rótulos legíveis dos enums, usados em relatórios e exportação. */
export const TIPO_LABEL: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Previsto",
  cleared: "Realizado",
  reconciled: "Conferido",
};

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Período padrão do relatório: 1º de janeiro do ano corrente até hoje. */
export function periodoPadrao(hoje = new Date()) {
  return { de: iso(new Date(hoje.getFullYear(), 0, 1)), ate: iso(hoje) };
}

/**
 * Sanitiza as datas vindas da URL: aceita só AAAA-MM-DD, cai no padrão quando
 * inválidas e garante que `de` não venha depois de `ate`.
 */
export function normalizarPeriodo(
  de: string | null | undefined,
  ate: string | null | undefined,
) {
  const padrao = periodoPadrao();
  const d = de && RE_ISO.test(de) ? de : padrao.de;
  const a = ate && RE_ISO.test(ate) ? ate : padrao.ate;
  return d <= a ? { de: d, ate: a } : { de: a, ate: d };
}

export function normalizarRegime(v: string | null | undefined): Regime {
  return v === "caixa" ? "caixa" : "competencia";
}

/** Data ISO exibida como dd/mm/aaaa. */
export function formatarDataBR(isoStr: string): string {
  const [ano, mes, dia] = isoStr.split("-");
  return `${dia}/${mes}/${ano}`;
}
