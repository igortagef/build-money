/**
 * Geração de CSV para exportação.
 *
 * Duas escolhas deliberadas para o arquivo abrir certo no Excel brasileiro:
 *   - delimitador ";" — no pt-BR a vírgula é separador decimal, então usar
 *     vírgula como separador de colunas embaralha tudo;
 *   - BOM UTF-8 no começo — sem ele o Excel lê os acentos como lixo.
 */

/** Escapa um campo: envolve em aspas se contiver separador, aspas ou quebra. */
function campo(valor: string | number | null | undefined): string {
  const s = String(valor ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monta o CSV a partir de um cabeçalho e das linhas. */
export function montarCsv(
  cabecalho: string[],
  linhas: Array<Array<string | number | null | undefined>>,
): string {
  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map(campo).join(";"))
    .join("\r\n");
  return `﻿${corpo}`;
}

/**
 * Valor monetário para célula numérica: "1234,56" (sem símbolo, com vírgula
 * decimal) para o Excel pt-BR reconhecer como número, não como texto.
 */
export function centavosParaCsv(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
