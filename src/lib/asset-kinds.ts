import type { AssetKind } from "@/db/schema";

/**
 * Constantes de patrimônio SEM acesso a banco — podem ser usadas por
 * componentes cliente. As queries (que tocam o banco) ficam em lib/assets.ts,
 * marcado `server-only`; misturar as duas coisas derruba a página do cliente.
 */

export const KINDS_INVESTIMENTO: AssetKind[] = ["fixed_income", "variable_income"];
export const KINDS_BEM: AssetKind[] = ["real_estate", "vehicle", "other"];

export const KIND_LABEL: Record<AssetKind, string> = {
  fixed_income: "Renda fixa",
  variable_income: "Renda variável",
  real_estate: "Imóvel",
  vehicle: "Veículo",
  other: "Outro bem",
};

export function ehInvestimento(kind: AssetKind): boolean {
  return KINDS_INVESTIMENTO.includes(kind);
}

/** Rótulo do tipo, usando o customizado quando é "outro bem" com rótulo. */
export function rotuloTipo(kind: AssetKind, customKind?: string | null): string {
  if (kind === "other" && customKind) return customKind;
  return KIND_LABEL[kind];
}
