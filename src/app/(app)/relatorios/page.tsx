import Link from "next/link";
import { Download, FileSpreadsheet, ChevronRight } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getRelatorioPeriodo } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import {
  normalizarPeriodo,
  normalizarRegime,
  formatarDataBR,
} from "@/lib/periodo";
import { REGIME_LABEL, REGIME_EXPLICACAO, type Regime } from "@/lib/statement";
import { buttonClasses, Card, cn } from "@/components/ui";
import { MonthlyTrendChart, CategoryRanking } from "@/components/charts";
import { RelatoriosNav } from "./nav";

export const metadata = { title: "Relatórios · Build Money" };

/** dd/mm/aaaa a partir de uma Date, para os presets. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function RelatoriosPage(props: {
  searchParams: Promise<{ de?: string; ate?: string; regime?: string }>;
}) {
  const sp = await props.searchParams;
  const { de, ate } = normalizarPeriodo(sp.de, sp.ate);
  const regime = normalizarRegime(sp.regime);

  const { ledgerId, baseCurrency } = await requireAccess();
  const rel = await getRelatorioPeriodo(ledgerId, de, ate, regime);

  // O saldo acumulado é uma leitura do período: começa do zero no primeiro mês
  // mostrado e soma o resultado de cada mês, revelando a trajetória. Somamos por
  // prefixo (sem acumulador externo, que o compilador do React rejeita no render).
  const dadosGrafico = rel.porMes.map((m, i) => ({
    ...m,
    saldoAcumulado: rel.porMes
      .slice(0, i + 1)
      .reduce((s, x) => s + x.resultado, 0),
  }));

  const qs = new URLSearchParams({ de, ate, regime }).toString();

  // Rastreio: leva aos lançamentos que compõem cada valor, no mesmo período.
  const drill = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ de, ate });
    if (regime === "caixa") p.set("regime", "caixa");
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `/lancamentos?${p.toString()}`;
  };
  // Último dia do mês YYYY-MM (para o intervalo de uma linha da tabela mensal).
  const fimDoMes = (ym: string) => {
    const [a, m] = ym.split("-").map(Number);
    return `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
  };

  const porCategoriaLink = rel.porCategoria.map((c) => ({
    ...c,
    href: drill({ tipo: "expense", categoria: c.id }),
  }));
  const porCentroLink = rel.porCentro.map((c) => ({
    ...c,
    href: c.id ? drill({ tipo: "expense", centro: c.id }) : drill({ tipo: "expense" }),
  }));

  // Presets de período — atalhos para as janelas mais pedidas.
  const hoje = new Date();
  const presets: Array<{ label: string; de: string; ate: string }> = [
    {
      label: "Este mês",
      de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      ate: iso(hoje),
    },
    {
      label: "Este ano",
      de: iso(new Date(hoje.getFullYear(), 0, 1)),
      ate: iso(hoje),
    },
    {
      label: "Últimos 12 meses",
      de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)),
      ate: iso(hoje),
    },
  ];
  const presetUrl = (p: { de: string; ate: string }) =>
    `/relatorios?${new URLSearchParams({ de: p.de, ate: p.ate, regime }).toString()}`;

  const temDados = rel.porMes.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <RelatoriosNav atual="resumo" qs={qs} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatarDataBR(de)} a {formatarDataBR(ate)} · regime de {REGIME_LABEL[regime].toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* <a> puro (não Link): o cabeçalho attachment faz o navegador baixar. */}
          <a
            href={`/relatorios/exportar?tipo=lancamentos&${qs}`}
            className={buttonClasses("secondary")}
          >
            <Download className="size-4" />
            Lançamentos (CSV)
          </a>
          <a
            href={`/relatorios/exportar?tipo=categorias&${qs}`}
            className={buttonClasses("secondary")}
          >
            <FileSpreadsheet className="size-4" />
            Por categoria (CSV)
          </a>
        </div>
      </div>

      {/* Filtro de período */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const ativo = p.de === de && p.ate === ate;
            return (
              <a
                key={p.label}
                href={presetUrl(p)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  ativo
                    ? "bg-primary-subtle text-primary-text"
                    : "text-muted-foreground hover:bg-surface-muted",
                )}
              >
                {p.label}
              </a>
            );
          })}
        </div>

        <form method="get" action="/relatorios" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">De</span>
            <input
              type="date"
              name="de"
              defaultValue={de}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Até</span>
            <input
              type="date"
              name="ate"
              defaultValue={ate}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Regime</span>
            <select
              name="regime"
              defaultValue={regime}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              {(["competencia", "caixa"] as Regime[]).map((r) => (
                <option key={r} value={r}>
                  {REGIME_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClasses()}>
            Aplicar
          </button>
        </form>
        <p className="text-xs text-muted-foreground">{REGIME_EXPLICACAO[regime]}</p>
      </Card>

      {!temDados ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum lançamento no período escolhido.
          </p>
        </Card>
      ) : (
        <>
          {/* Totais do período — clicáveis, levam aos lançamentos que os compõem */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumo label="Receitas" valor={formatMoney(rel.totais.receitas, baseCurrency)} tom="income" href={drill({ tipo: "income" })} />
            <Resumo label="Despesas" valor={formatMoney(rel.totais.despesas, baseCurrency)} tom="expense" href={drill({ tipo: "expense" })} />
            <Resumo
              label="Resultado"
              valor={formatMoney(rel.totais.resultado, baseCurrency)}
              tom={rel.totais.resultado >= 0 ? "income" : "expense"}
              href={drill({})}
            />
          </div>

          <MonthlyTrendChart dados={dadosGrafico} currency={baseCurrency} />

          {/* Evolução mês a mês em tabela — precisa, exportável, sem depender do gráfico */}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Mês</th>
                  <th className="px-4 py-3 text-right font-semibold">Receitas</th>
                  <th className="px-4 py-3 text-right font-semibold">Despesas</th>
                  <th className="px-4 py-3 text-right font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rel.porMes.map((m) => {
                  const mInicio = `${m.mes}-01`;
                  const mFim = fimDoMes(m.mes);
                  const cel = (tipo: string) => `/lancamentos?${new URLSearchParams({
                    de: mInicio,
                    ate: mFim,
                    ...(regime === "caixa" ? { regime: "caixa" } : {}),
                    ...(tipo ? { tipo } : {}),
                  }).toString()}`;
                  return (
                    <tr key={m.mes} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-2.5 font-medium">{m.rotulo}</td>
                      <td className="px-0 py-0 text-right">
                        <Link href={cel("income")} className="tabular block px-4 py-2.5 text-income hover:underline">
                          {formatMoney(m.receitas, baseCurrency)}
                        </Link>
                      </td>
                      <td className="px-0 py-0 text-right">
                        <Link href={cel("expense")} className="tabular block px-4 py-2.5 text-expense hover:underline">
                          {formatMoney(m.despesas, baseCurrency)}
                        </Link>
                      </td>
                      <td className="px-0 py-0 text-right">
                        <Link
                          href={cel("")}
                          className={cn(
                            "tabular block px-4 py-2.5 font-semibold hover:underline",
                            m.resultado >= 0 ? "text-income" : "text-expense",
                          )}
                        >
                          {formatMoney(m.resultado, baseCurrency)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="tabular px-4 py-3 text-right text-income">
                    {formatMoney(rel.totais.receitas, baseCurrency)}
                  </td>
                  <td className="tabular px-4 py-3 text-right text-expense">
                    {formatMoney(rel.totais.despesas, baseCurrency)}
                  </td>
                  <td
                    className={cn(
                      "tabular px-4 py-3 text-right",
                      rel.totais.resultado >= 0 ? "text-income" : "text-expense",
                    )}
                  >
                    {formatMoney(rel.totais.resultado, baseCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryRanking
              titulo="Despesas por categoria"
              dados={porCategoriaLink}
              currency={baseCurrency}
              vazio="Sem despesas no período."
            />
            <CategoryRanking
              titulo="Despesas por centro de custo"
              dados={porCentroLink}
              currency={baseCurrency}
              vazio="Sem despesas no período."
            />
          </div>
        </>
      )}
    </div>
  );
}

function Resumo({
  label,
  valor,
  tom,
  href,
}: {
  label: string;
  valor: string;
  tom: "income" | "expense";
  href?: string;
}) {
  const corpo = (
    <>
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        {href && <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />}
      </p>
      <p
        className={cn(
          "tabular mt-1 text-lg font-semibold",
          tom === "income" ? "text-income" : "text-expense",
        )}
      >
        {valor}
      </p>
    </>
  );
  return href ? (
    <Link href={href} title={`Ver lançamentos de ${label.toLowerCase()}`}>
      <Card className="group p-4 transition-colors hover:border-border-strong">{corpo}</Card>
    </Link>
  ) : (
    <Card className="p-4">{corpo}</Card>
  );
}
