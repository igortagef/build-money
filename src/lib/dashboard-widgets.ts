/**
 * Catálogo dos blocos do painel inicial, na ORDEM e no agrupamento definidos
 * pelo usuário. Cada grupo é uma faixa do painel; `colunas` diz quantos blocos
 * cabem por linha. A preferência de visibilidade mora em users.dashboard_hidden.
 * É dado puro — pode ser importado no servidor e no cliente.
 */
export type PainelWidget = { id: string; label: string; grupo: string };

export const PAINEL_WIDGETS: PainelWidget[] = [
  // 1 — Resultado (mesma linha)
  { id: "kpi-receitas", label: "Receitas do mês", grupo: "Resultado" },
  { id: "kpi-despesas", label: "Despesas do mês", grupo: "Resultado" },
  { id: "kpi-resultado", label: "Resultado do mês", grupo: "Resultado" },
  // 2 — Patrimônio (mesma linha)
  { id: "kpi-patrimonio", label: "Patrimônio líquido", grupo: "Patrimônio" },
  { id: "kpi-saldo", label: "Saldo em contas", grupo: "Patrimônio" },
  { id: "kpi-investimentos", label: "Investimentos", grupo: "Patrimônio" },
  // 3 — Engajamento (mesma linha)
  { id: "resumo-dia", label: "Resumo do dia", grupo: "Engajamento" },
  { id: "streak", label: "Sequência diária", grupo: "Engajamento" },
  // 4 — Do mês (uma por linha)
  { id: "vencimentos", label: "Vencimentos", grupo: "Do mês" },
  { id: "evolucao", label: "Evolução mensal", grupo: "Do mês" },
  // 5 — Resumos (mesma linha)
  { id: "orcamento", label: "Orçamento do mês", grupo: "Resumos" },
  { id: "metas", label: "Metas", grupo: "Resumos" },
  { id: "rachas", label: "Rachas", grupo: "Resumos" },
  // 6 — Despesas (mesma linha)
  { id: "despesas-categoria", label: "Despesas por categoria", grupo: "Despesas" },
  { id: "despesas-centro", label: "Despesas por centro de custo", grupo: "Despesas" },
  // 7 — Acompanhamento (mesma linha)
  { id: "a-conferir", label: "A conferir", grupo: "Acompanhamento" },
  { id: "comparativo", label: "Comparativo com o mês anterior", grupo: "Acompanhamento" },
];

export const PAINEL_WIDGET_IDS = PAINEL_WIDGETS.map((w) => w.id);

/** Ordem dos grupos no editor do painel. */
export const PAINEL_GRUPOS = [
  "Resultado",
  "Patrimônio",
  "Engajamento",
  "Do mês",
  "Resumos",
  "Despesas",
  "Acompanhamento",
];

/** Blocos escondidos por padrão (quem nunca personalizou não os vê). */
export const PAINEL_OCULTOS_PADRAO: string[] = [];
