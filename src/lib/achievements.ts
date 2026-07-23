import type { XpKind } from "@/db/schema";

/**
 * Regras da gamificação.
 *
 * Princípio que guia os valores abaixo: o app recompensa **o hábito de
 * registrar**, não o de gastar. Nenhuma recompensa depende do valor do
 * lançamento — gastar R$ 5.000 não vale mais XP que gastar R$ 5. Premiar
 * valor alto ensinaria exatamente o comportamento errado num app cujo
 * objetivo é o usuário gastar melhor.
 *
 * O que dá XP é: aparecer todo dia, manter o registro em dia, conferir com o
 * extrato e cumprir metas.
 */

export const XP: Record<XpKind, number> = {
  daily_check_in: 10,
  transaction_logged: 5,
  // Rateio dá mais porque exige categorizar item a item — o comportamento
  // que torna os relatórios úteis.
  transaction_split: 12,
  reconciled_transaction: 3,
  account_reconciled: 40,
  goal_created: 15,
  goal_achieved: 100,
  budget_kept: 60,
  month_positive: 80,
  streak_bonus: 25,
  achievement: 0, // cada conquista traz o próprio valor
};

/**
 * Curva de níveis. Cresce de forma quadrática: os primeiros níveis vêm
 * rápido para dar tração, e os últimos exigem meses de uso constante.
 * Nível N exige 50 * N * (N-1) de XP acumulado.
 */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  // Inverso da fórmula acima, resolvido pela equação do segundo grau.
  return Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2);
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const atual = xpForLevel(level);
  const proximo = xpForLevel(level + 1);
  const feito = xp - atual;
  const falta = proximo - xp;
  const total = proximo - atual;

  return {
    level,
    xp,
    xpNoNivel: feito,
    xpParaProximo: falta,
    xpDoNivel: total,
    percentual: Math.round((feito / total) * 100),
    titulo: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
  };
}

/** Nomes dos níveis seguindo a metáfora da marca: construir bloco a bloco. */
export const LEVEL_TITLES = [
  "Primeiro tijolo",
  "Alicerce",
  "Fundação",
  "Pilar",
  "Estrutura",
  "Alvenaria",
  "Laje",
  "Cobertura",
  "Acabamento",
  "Construtor",
  "Mestre de obras",
  "Arquiteto",
];

export type AchievementCode =
  | "primeiro_lancamento"
  | "dez_lancamentos"
  | "cem_lancamentos"
  | "primeiro_rateio"
  | "rateio_tres_categorias"
  | "ofensiva_3"
  | "ofensiva_7"
  | "ofensiva_30"
  | "primeira_conta"
  | "multi_conta"
  | "primeira_conciliacao"
  | "conta_conciliada"
  | "mes_conciliado"
  | "primeira_meta"
  | "meta_atingida"
  | "mes_no_azul"
  | "tres_meses_azul"
  | "categorizador";

export type Achievement = {
  code: AchievementCode;
  nome: string;
  descricao: string;
  /** Dica de como conseguir, mostrada enquanto está bloqueada. */
  comoObter: string;
  icone: string;
  xp: number;
  /** Conquistas secretas não aparecem na lista antes de desbloquear. */
  secreta?: boolean;
  grupo: "habito" | "registro" | "conciliacao" | "metas" | "resultado";
};

export const ACHIEVEMENTS: Achievement[] = [
  // Hábito
  {
    code: "ofensiva_3",
    nome: "Pegando o ritmo",
    descricao: "3 dias seguidos usando o app.",
    comoObter: "Abra o app 3 dias seguidos.",
    icone: "flame",
    xp: 30,
    grupo: "habito",
  },
  {
    code: "ofensiva_7",
    nome: "Semana cheia",
    descricao: "7 dias seguidos usando o app.",
    comoObter: "Abra o app 7 dias seguidos.",
    icone: "flame",
    xp: 80,
    grupo: "habito",
  },
  {
    code: "ofensiva_30",
    nome: "Virou rotina",
    descricao: "30 dias seguidos usando o app.",
    comoObter: "Abra o app 30 dias seguidos.",
    icone: "flame",
    xp: 300,
    grupo: "habito",
  },

  // Registro
  {
    code: "primeira_conta",
    nome: "Primeiro tijolo",
    descricao: "Você cadastrou sua primeira conta.",
    comoObter: "Cadastre uma conta.",
    icone: "wallet",
    xp: 20,
    grupo: "registro",
  },
  {
    code: "primeiro_lancamento",
    nome: "Começou a obra",
    descricao: "Seu primeiro lançamento está registrado.",
    comoObter: "Registre um lançamento.",
    icone: "pencil",
    xp: 25,
    grupo: "registro",
  },
  {
    code: "dez_lancamentos",
    nome: "Alvenaria",
    descricao: "10 lançamentos registrados.",
    comoObter: "Registre 10 lançamentos.",
    icone: "layers",
    xp: 50,
    grupo: "registro",
  },
  {
    code: "cem_lancamentos",
    nome: "Canteiro movimentado",
    descricao: "100 lançamentos registrados.",
    comoObter: "Registre 100 lançamentos.",
    icone: "layers",
    xp: 250,
    grupo: "registro",
  },
  {
    code: "multi_conta",
    nome: "Tudo no mapa",
    descricao: "3 contas cadastradas.",
    comoObter: "Cadastre 3 contas — corrente, cartão, espécie…",
    icone: "wallet",
    xp: 40,
    grupo: "registro",
  },
  {
    code: "primeiro_rateio",
    nome: "Divisor de águas",
    descricao: "Você dividiu um lançamento entre categorias.",
    comoObter: "Use o rateio em um lançamento.",
    icone: "split",
    xp: 35,
    grupo: "registro",
  },
  {
    code: "rateio_tres_categorias",
    nome: "Item a item",
    descricao: "Um lançamento dividido em 3 ou mais categorias.",
    comoObter: "Rateie um lançamento entre 3 categorias ou mais.",
    icone: "split",
    xp: 60,
    grupo: "registro",
  },
  {
    code: "categorizador",
    nome: "Nada sem nome",
    descricao: "Um mês inteiro sem nenhum lançamento em 'Não identificado'.",
    comoObter: "Feche um mês com tudo categorizado.",
    icone: "tags",
    xp: 90,
    grupo: "registro",
  },

  // Conciliação
  {
    code: "primeira_conciliacao",
    nome: "Conferido",
    descricao: "Você conferiu seu primeiro lançamento com o extrato.",
    comoObter: "Marque um lançamento como conferido.",
    icone: "check",
    xp: 20,
    grupo: "conciliacao",
  },
  {
    code: "conta_conciliada",
    nome: "Contas em ordem",
    descricao: "Uma conta com todos os lançamentos do mês conferidos.",
    comoObter: "Concilie todos os lançamentos de uma conta no mês.",
    icone: "check-check",
    xp: 100,
    grupo: "conciliacao",
  },
  {
    code: "mes_conciliado",
    nome: "Fechamento impecável",
    descricao: "Todas as contas conciliadas no mesmo mês.",
    comoObter: "Concilie todas as suas contas em um mês.",
    icone: "shield-check",
    xp: 200,
    grupo: "conciliacao",
  },

  // Metas
  {
    code: "primeira_meta",
    nome: "Alvo definido",
    descricao: "Você criou sua primeira meta.",
    comoObter: "Crie uma meta.",
    icone: "target",
    xp: 25,
    grupo: "metas",
  },
  {
    code: "meta_atingida",
    nome: "Missão cumprida",
    descricao: "Você bateu uma meta.",
    comoObter: "Atinja uma meta que você criou.",
    icone: "trophy",
    xp: 150,
    grupo: "metas",
  },

  // Resultado
  {
    code: "mes_no_azul",
    nome: "Sobrou",
    descricao: "Você fechou um mês gastando menos do que ganhou.",
    comoObter: "Feche um mês no azul.",
    icone: "trending-up",
    xp: 100,
    grupo: "resultado",
  },
  {
    code: "tres_meses_azul",
    nome: "Construção sólida",
    descricao: "Três meses seguidos no azul.",
    comoObter: "Feche três meses seguidos no azul.",
    icone: "trending-up",
    xp: 300,
    grupo: "resultado",
  },
];

export const ACHIEVEMENT_BY_CODE = new Map(
  ACHIEVEMENTS.map((a) => [a.code, a]),
);

export const GRUPO_LABEL: Record<Achievement["grupo"], string> = {
  habito: "Hábito",
  registro: "Registro",
  conciliacao: "Conciliação",
  metas: "Metas",
  resultado: "Resultado",
};
