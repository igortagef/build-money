/**
 * Utilidades para colar dados do Excel/Sheets numa grade de lançamentos.
 *
 * O que vem da área de transferência de uma planilha é TSV: linhas separadas
 * por quebra de linha, células por tabulação. Datas e valores chegam no
 * formato brasileiro, então a interpretação precisa ser tolerante.
 */

/** Divide o texto colado em uma matriz de células (linha x coluna). */
export function parseTSV(texto: string): string[][] {
  return texto
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Uma última quebra de linha sozinha não vira uma linha vazia.
    .replace(/\n$/, "")
    .split("\n")
    .map((linha) => linha.split("\t"));
}

/**
 * Interpreta uma data colada e devolve em ISO (YYYY-MM-DD), ou null.
 * Aceita "31/07/2026", "31/07/26", "2026-07-31" e "31-07-2026".
 */
export function parseDataFlexivel(texto: string): string | null {
  const s = texto.trim();
  if (!s) return null;

  // Já em ISO.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, a, m, d] = iso;
    return valida(Number(a), Number(m), Number(d));
  }

  // DD/MM/AAAA ou DD-MM-AAAA (com ano de 2 ou 4 dígitos).
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const [, d, m, a] = br;
    let ano = Number(a);
    // "26" -> 2026. Assume o século atual; ninguém lança conta de 1926.
    if (ano < 100) ano += 2000;
    return valida(ano, Number(m), Number(d));
  }

  return null;
}

function valida(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12) return null;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  if (dia < 1 || dia > ultimoDia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Normaliza texto para casar categorias por nome: sem acento, sem caixa. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Tenta casar um texto de categoria colado com uma das categorias existentes.
 * Casa pelo nome da subcategoria ("Supermercado") ou pelo caminho completo
 * ("Alimentação › Supermercado"). Devolve o id ou null.
 */
export function casarCategoria(
  texto: string,
  categorias: { id: string; label: string }[],
): string | null {
  const alvo = normalizar(texto);
  if (!alvo) return null;

  // Caminho completo primeiro (mais específico), depois só o nome final.
  const porCaminho = categorias.find((c) => normalizar(c.label) === alvo);
  if (porCaminho) return porCaminho.id;

  const porNome = categorias.find((c) => {
    const nome = c.label.includes("›")
      ? c.label.split("›").pop()!.trim()
      : c.label;
    return normalizar(nome) === alvo;
  });
  return porNome?.id ?? null;
}
