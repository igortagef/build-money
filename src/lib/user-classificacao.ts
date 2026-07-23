/**
 * Classificações de tipo de usuário, usadas no console de administração.
 *
 * É uma lista de código (não uma tabela): adicionar um tipo novo é editar aqui,
 * sem migração. O valor guardado em `users.classificacao` é a chave; o rótulo é
 * só para exibição. `null`/ausente = sem classificação.
 */
export const CLASSIFICACOES = [
  { valor: "teste", rotulo: "Teste" },
  { valor: "cliente_agf", rotulo: "Cliente AG&F" },
  { valor: "amigo", rotulo: "Amigo" },
  { valor: "cliente_build", rotulo: "Cliente Build Money" },
] as const;

export type Classificacao = (typeof CLASSIFICACOES)[number]["valor"];

const PORVALOR = new Map<string, string>(CLASSIFICACOES.map((c) => [c.valor, c.rotulo]));

/** Rótulo de exibição de uma classificação (ou "Sem classificação"). */
export function rotuloClassificacao(valor: string | null | undefined): string {
  return (valor && PORVALOR.get(valor)) || "Sem classificação";
}

/** Confere se um valor recebido é uma classificação válida. */
export function classificacaoValida(valor: string): valor is Classificacao {
  return PORVALOR.has(valor);
}
