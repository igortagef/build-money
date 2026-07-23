import { requireAccess } from "@/lib/auth";
import { getRelatorioIR } from "@/lib/ir";
import { montarCsv, centavosParaCsv } from "@/lib/csv";

/**
 * Exporta o relatório de IR do ano em CSV (Excel pt-BR). Uma seção por bloco —
 * rendimentos, bens e direitos, dívidas — para facilitar a conferência.
 */
export async function GET(request: Request) {
  const { ledgerId } = await requireAccess();
  const url = new URL(request.url);
  const anoParam = Number(url.searchParams.get("ano"));
  const atual = new Date().getFullYear();
  const ano = Number.isInteger(anoParam) && anoParam >= 2000 && anoParam <= atual ? anoParam : atual - 1;

  const ir = await getRelatorioIR(ledgerId, ano);

  const linhas: Array<Array<string | number>> = [];
  linhas.push(["RENDIMENTOS RECEBIDOS", ""]);
  for (const r of ir.rendimentos) linhas.push([r.name ?? "Sem categoria", centavosParaCsv(r.total)]);
  linhas.push(["Total de rendimentos", centavosParaCsv(ir.totalRendimentos)]);
  linhas.push(["", ""]);

  linhas.push([`BENS E DIREITOS EM 31/12/${ano}`, ""]);
  for (const b of ir.bens) linhas.push([`${b.nome} (${b.tipo})`, centavosParaCsv(b.valor)]);
  linhas.push(["Total de bens e direitos", centavosParaCsv(ir.totalBens)]);
  linhas.push(["", ""]);

  linhas.push([`DÍVIDAS E ÔNUS EM 31/12/${ano}`, ""]);
  for (const d of ir.dividas) linhas.push([`${d.nome} (${d.tipo})`, centavosParaCsv(d.valor)]);
  linhas.push(["Total de dívidas", centavosParaCsv(ir.totalDividas)]);
  linhas.push(["", ""]);
  linhas.push(["Patrimônio líquido em 31/12", centavosParaCsv(ir.patrimonioLiquido)]);

  const csv = montarCsv(["Descrição", "Valor (R$)"], linhas);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="imposto-de-renda-${ano}.csv"`,
    },
  });
}
