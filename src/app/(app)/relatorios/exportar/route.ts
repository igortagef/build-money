import { requireAccess } from "@/lib/auth";
import { getRelatorioPeriodo, getTransacoesParaExport } from "@/lib/queries";
import { montarCsv, centavosParaCsv } from "@/lib/csv";
import {
  normalizarPeriodo,
  normalizarRegime,
  formatarDataBR,
  TIPO_LABEL,
  STATUS_LABEL,
} from "@/lib/periodo";

/**
 * Exportação em CSV. Dois conteúdos, por `?tipo=`:
 *   lancamentos (padrão) — uma linha por lançamento do período;
 *   categorias           — despesas somadas por categoria.
 *
 * O período e o regime vêm da mesma tela de relatórios (`de`, `ate`, `regime`),
 * então o arquivo bate com o que o usuário está vendo.
 */
export async function GET(request: Request) {
  const { ledgerId } = await requireAccess();
  const url = new URL(request.url);

  const { de, ate } = normalizarPeriodo(
    url.searchParams.get("de"),
    url.searchParams.get("ate"),
  );
  const regime = normalizarRegime(url.searchParams.get("regime"));
  const tipo = url.searchParams.get("tipo") === "categorias" ? "categorias" : "lancamentos";

  let csv: string;
  let nome: string;

  if (tipo === "categorias") {
    const { porCategoria, totais } = await getRelatorioPeriodo(ledgerId, de, ate, regime);
    csv = montarCsv(
      ["Categoria", "Total (R$)"],
      [
        ...porCategoria.map((c) => [c.name, centavosParaCsv(c.total)]),
        ["Total geral", centavosParaCsv(totais.despesas)],
      ],
    );
    nome = `despesas-por-categoria-${de}-a-${ate}.csv`;
  } else {
    const linhas = await getTransacoesParaExport(ledgerId, de, ate, regime);
    csv = montarCsv(
      [
        "Data",
        "Data de caixa",
        "Descrição",
        "Conta",
        "Tipo",
        "Situação",
        "Categorias",
        "Moeda",
        "Valor",
        "Valor (base R$)",
      ],
      linhas.map((l) => {
        // Sinal explícito na planilha: despesa sai negativa, transferência
        // mantém o sinal com que foi gravada, receita é positiva.
        const valor = l.type === "expense" ? -Math.abs(l.amount) : l.amount;
        const valorBase = l.type === "expense" ? -Math.abs(l.amountBase) : l.amountBase;
        return [
          formatarDataBR(l.date),
          l.settlementDate ? formatarDataBR(l.settlementDate) : "",
          l.description,
          l.accountName,
          TIPO_LABEL[l.type] ?? l.type,
          STATUS_LABEL[l.status] ?? l.status,
          l.categorias.join(", "),
          l.currency,
          centavosParaCsv(valor),
          centavosParaCsv(valorBase),
        ];
      }),
    );
    nome = `lancamentos-${de}-a-${ate}.csv`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
