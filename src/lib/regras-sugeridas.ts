/**
 * Regras de categorização sugeridas — só casos que valem para QUALQUER usuário.
 *
 * O critério para entrar aqui: o texto tem que significar a mesma coisa para
 * todo mundo (iFood é sempre delivery; Enel é sempre energia). Ficaram de fora
 * termos ambíguos como "Mercado" (casaria com Mercado Pago/Livre) ou "99".
 *
 * `categoria` é o nome da categoria-folha do plano padrão; se o usuário tiver
 * renomeado/apagado, a sugestão simplesmente não é aplicada.
 */
export type RegraSugerida = { pattern: string; categoria: string };

export const REGRAS_SUGERIDAS: RegraSugerida[] = [
  // Alimentação — o padrão mais longo vence, então "Uber Eats" não vira transporte.
  { pattern: "Uber Eats", categoria: "Delivery" },
  { pattern: "iFood", categoria: "Delivery" },
  { pattern: "Rappi", categoria: "Delivery" },
  { pattern: "Restaurante", categoria: "Restaurante" },
  { pattern: "Padaria", categoria: "Padaria" },
  { pattern: "Supermercado", categoria: "Supermercado" },

  // Transporte
  { pattern: "Uber", categoria: "Aplicativos de transporte" },
  { pattern: "Posto", categoria: "Combustível" },
  { pattern: "Pedágio", categoria: "Pedágio" },
  { pattern: "Estacionamento", categoria: "Estacionamento" },
  { pattern: "IPVA", categoria: "IPVA e licenciamento" },

  // Moradia
  { pattern: "Aluguel", categoria: "Aluguel" },
  { pattern: "Condomínio", categoria: "Condomínio" },
  { pattern: "IPTU", categoria: "IPTU" },
  { pattern: "Energia elétrica", categoria: "Energia elétrica" },
  { pattern: "Enel", categoria: "Energia elétrica" },
  { pattern: "CPFL", categoria: "Energia elétrica" },
  { pattern: "Cemig", categoria: "Energia elétrica" },
  { pattern: "Copel", categoria: "Energia elétrica" },
  { pattern: "Neoenergia", categoria: "Energia elétrica" },
  { pattern: "Internet", categoria: "Internet" },

  // Saúde
  { pattern: "Farmácia", categoria: "Farmácia" },
  { pattern: "Drogaria", categoria: "Farmácia" },
  { pattern: "Academia", categoria: "Academia" },

  // Lazer
  { pattern: "Netflix", categoria: "Streaming" },
  { pattern: "Spotify", categoria: "Streaming" },
  { pattern: "Cinema", categoria: "Cinema e teatro" },
];

/** Normaliza para comparar nomes de categoria sem depender de acento/caixa. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}
