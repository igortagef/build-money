/**
 * Leitura local de extratos e faturas — sem IA, sem serviço externo.
 *
 * Dois formatos cobrem quase todo banco e cartão brasileiro:
 *   OFX  — o "Money 2000"/Open Financial Exchange que a maioria dos bancos
 *          exporta com um clique. Tem FITID, um id único por lançamento, que
 *          torna a deduplicação exata.
 *   CSV  — o exportável universal. Sem id, então a chave de deduplicação é
 *          derivada de data+valor+descrição.
 *
 * A saída é normalizada: valor em centavos inteiros e SINALIZADO (negativo =
 * saída). O tipo (receita/despesa) vem do sinal. Datas em ISO AAAA-MM-DD.
 */

export type LancamentoImportado = {
  data: string; // competência (quando o fato aconteceu)
  dataCaixa: string | null; // pagamento/recebimento (quando o dinheiro se move)
  descricao: string;
  amount: number; // centavos, com sinal (negativo = saída)
  tipo: "income" | "expense";
  categoria: string | null; // nome da categoria vindo do arquivo, se houver
  fitid: string | null;
};

export type FormatoImport = "ofx" | "csv";

/** Converte "1.234,56", "1234.56", "-50,00", "R$ 10,00" em centavos com sinal. */
export function valorParaCentavos(bruto: string): number | null {
  const negativo = /-/.test(bruto) || /\(.*\)/.test(bruto); // (123,45) = negativo
  let limpo = bruto.replace(/[^\d.,]/g, "").trim();
  if (!limpo) return null;

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    // O separador decimal é o que aparece por último.
    if (ultimaVirgula > ultimoPonto) limpo = limpo.replace(/\./g, "").replace(",", ".");
    else limpo = limpo.replace(/,/g, "");
  } else if (ultimaVirgula > -1) {
    // Só vírgula: decimal se houver 1-2 casas depois; senão é separador de milhar.
    const depois = limpo.length - ultimaVirgula - 1;
    limpo = depois <= 2 ? limpo.replace(",", ".") : limpo.replace(/,/g, "");
  } else if (ultimoPonto > -1) {
    // Só ponto, o caso ambíguo: "4.50" é decimal (en-US), "1.000" é milhar
    // (pt-BR). Três casas depois do último ponto = separador de milhar.
    const depois = limpo.length - ultimoPonto - 1;
    if (depois === 3) limpo = limpo.replace(/\./g, "");
  }
  const num = Number(limpo);
  if (!Number.isFinite(num)) return null;
  const cents = Math.round(num * 100);
  return negativo ? -Math.abs(cents) : cents;
}

/** Normaliza datas comuns de extrato para ISO. Aceita ISO, AAAAMMDD e dd/mm/aaaa. */
export function dataParaIso(bruto: string): string | null {
  const s = bruto.trim();

  // OFX: AAAAMMDD com hora/fuso opcional grudado (20260718, 20260718120000[-3])
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;

  // ISO já pronto.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/mm/aaaa ou dd-mm-aaaa (aa ou aaaa).
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

/** Extrai os blocos <STMTTRN> de um OFX (funciona com ou sem tags de fechamento). */
export function parseOFX(texto: string): LancamentoImportado[] {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  const campo = (bloco: string, tag: string): string | null => {
    // OFX raramente fecha as tags de folha: <MEMO>Padaria vem sem </MEMO>.
    const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
    return m ? m[1].trim() : null;
  };

  const saida: LancamentoImportado[] = [];
  for (const bloco of blocos) {
    const dataBruta = campo(bloco, "DTPOSTED");
    const valorBruto = campo(bloco, "TRNAMT");
    const data = dataBruta ? dataParaIso(dataBruta) : null;
    const amount = valorBruto ? valorParaCentavos(valorBruto) : null;
    if (!data || amount === null || amount === 0) continue;

    // MEMO costuma ser mais descritivo que NAME; usa o que existir.
    const descricao =
      campo(bloco, "MEMO") ?? campo(bloco, "NAME") ?? campo(bloco, "TRNTYPE") ?? "Lançamento importado";

    saida.push({
      data,
      // No extrato bancário a data postada já é a data de caixa; competência
      // e caixa coincidem. Sem categoria no OFX.
      dataCaixa: data,
      descricao: descricao.replace(/\s+/g, " ").trim().slice(0, 200),
      amount,
      tipo: amount < 0 ? "expense" : "income",
      categoria: null,
      fitid: campo(bloco, "FITID"),
    });
  }
  return saida;
}

/** Quebra uma linha CSV respeitando aspas e o delimitador dado. */
function quebrarLinhaCsv(linha: string, delim: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === delim && !dentroAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

const CABECALHOS_DATA = ["data", "date", "dt"];
const CABECALHOS_COMPETENCIA = ["competência", "competencia", "compet"];
const CABECALHOS_PAGAMENTO = ["pagamento", "recebimento", "caixa", "liquidação", "liquidacao", "compensação", "compensacao", "pago em", "efetiv"];
const CABECALHOS_CATEGORIA = ["categoria", "category", "classificação", "classificacao"];
const CABECALHOS_DESC = ["histórico", "historico", "descrição", "descricao", "description", "memo", "lançamento", "lancamento", "estabelecimento", "detalhe"];
const CABECALHOS_VALOR = ["valor", "amount", "value", "montante", "quantia"];

/**
 * Lê um CSV de extrato/fatura/planilha detectando o delimitador e as colunas
 * pelo cabeçalho: competência, pagamento/recebimento, descrição, categoria e
 * valor. Sem cabeçalho reconhecível, assume a ordem clássica data;descrição;valor.
 */
export function parseCSV(texto: string): LancamentoImportado[] {
  const linhas = texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return [];

  // Delimitador: o que mais aparece na primeira linha entre ; , e tab.
  const candidatos = [";", ",", "\t"];
  const delim = candidatos
    .map((d) => ({ d, n: linhas[0].split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const primeira = quebrarLinhaCsv(linhas[0], delim).map((c) => c.toLowerCase());
  const achaTodos = (nomes: string[]) =>
    primeira.findIndex((c) => nomes.some((n) => c.includes(n)));

  const iCategoria = achaTodos(CABECALHOS_CATEGORIA);
  const iValor = achaTodos(CABECALHOS_VALOR);
  const iDesc = achaTodos(CABECALHOS_DESC);
  // Pagamento/recebimento é o mais específico; detecta primeiro.
  const iPagamento = achaTodos(CABECALHOS_PAGAMENTO);
  // Competência: coluna explícita, senão a coluna "data" que NÃO é a de pagamento.
  let iComp = achaTodos(CABECALHOS_COMPETENCIA);
  if (iComp < 0) {
    iComp = primeira.findIndex(
      (c, idx) => idx !== iPagamento && CABECALHOS_DATA.some((n) => c.includes(n)),
    );
  }

  const temCabecalho = iComp > -1 && iValor > -1;

  // Índices efetivos (sem cabeçalho: ordem clássica data;descrição;valor).
  const cData = temCabecalho ? iComp : 0;
  const cDesc = temCabecalho ? (iDesc > -1 ? iDesc : 1) : 1;
  const cValor = temCabecalho ? iValor : 2;

  const corpo = temCabecalho ? linhas.slice(1) : linhas;
  const saida: LancamentoImportado[] = [];
  for (const linha of corpo) {
    const cols = quebrarLinhaCsv(linha, delim);
    const data = dataParaIso(cols[cData] ?? "");
    const amount = valorParaCentavos(cols[cValor] ?? "");
    if (!data || amount === null || amount === 0) continue;

    const descricao = (cols[cDesc] ?? "").replace(/\s+/g, " ").trim() || "Lançamento importado";
    // Data de pagamento/recebimento, quando a coluna existe e é válida.
    const dataCaixa =
      temCabecalho && iPagamento > -1 ? dataParaIso(cols[iPagamento] ?? "") : null;
    const categoria =
      temCabecalho && iCategoria > -1
        ? (cols[iCategoria] ?? "").replace(/\s+/g, " ").trim() || null
        : null;

    saida.push({
      data,
      dataCaixa,
      descricao: descricao.slice(0, 200),
      amount,
      tipo: amount < 0 ? "expense" : "income",
      categoria,
      fitid: null,
    });
  }
  return saida;
}

/** Detecta o formato pelo conteúdo/nome e delega ao parser certo. */
export function parseExtrato(texto: string, nomeArquivo = ""): LancamentoImportado[] {
  const pareceOfx = /<OFX>|<STMTTRN>|OFXHEADER/i.test(texto) || /\.ofx$/i.test(nomeArquivo);
  return pareceOfx ? parseOFX(texto) : parseCSV(texto);
}

/**
 * Chave de deduplicação de um lançamento importado. Usa o FITID quando existe
 * (id do banco); senão, deriva de data+valor+descrição — determinística, então
 * o mesmo lançamento no mesmo arquivo/reimportação gera sempre a mesma chave.
 */
export function chaveDedup(l: LancamentoImportado): string {
  if (l.fitid) return `fitid:${l.fitid}`;
  const desc = l.descricao.toLowerCase().replace(/\s+/g, " ").trim();
  return `hash:${l.data}|${l.amount}|${desc}`;
}
