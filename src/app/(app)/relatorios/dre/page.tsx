import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getDRE } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import {
  normalizarPeriodo,
  normalizarRegime,
  formatarDataBR,
} from "@/lib/periodo";
import { REGIME_LABEL, type Regime } from "@/lib/statement";
import { buttonClasses, Card, cn } from "@/components/ui";
import { RelatoriosNav } from "../nav";

export const metadata = { title: "DRE · Build Money" };

export default async function DREPage(props: {
  searchParams: Promise<{ de?: string; ate?: string; regime?: string }>;
}) {
  const sp = await props.searchParams;
  const { de, ate } = normalizarPeriodo(sp.de, sp.ate);
  const regime = normalizarRegime(sp.regime);

  const { ledgerId, baseCurrency } = await requireAccess();
  const dre = await getDRE(ledgerId, de, ate, regime);
  const qs = new URLSearchParams({ de, ate, regime }).toString();

  const temDados = dre.totalReceitas > 0 || dre.totalDespesas > 0;
  const fmt = (v: number) => formatMoney(v, baseCurrency);

  // Rastreio: cada valor leva aos lançamentos que o compõem, no mesmo período.
  const drill = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ de, ate });
    if (regime === "caixa") p.set("regime", "caixa");
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `/lancamentos?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <RelatoriosNav atual="dre" qs={qs} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DRE</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatarDataBR(de)} a {formatarDataBR(ate)} · regime de{" "}
          {REGIME_LABEL[regime].toLowerCase()}.
        </p>
      </div>

      {/* O que é DRE: o relatório tem nome de contabilidade, então explica-se. */}
      <Card className="flex items-start gap-3 border-primary-border bg-primary-subtle p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-primary-text" />
        <p className="text-xs leading-relaxed text-primary-text">
          <span className="font-semibold">DRE (Demonstração do Resultado)</span> é o
          relatório que mostra, num período, <strong>quanto entrou</strong>,{" "}
          <strong>quanto saiu</strong> e <strong>o que sobrou</strong>. As receitas
          aparecem por categoria e as despesas por centro de custo; no fim, o
          resultado — <em>superávit</em> quando sobra dinheiro, <em>déficit</em>{" "}
          quando falta. A margem diz qual fatia do que entrou você conseguiu guardar.
        </p>
      </Card>

      {/* Filtro de período */}
      <Card className="p-5">
        <form method="get" action="/relatorios/dre" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">De</span>
            <input type="date" name="de" defaultValue={de} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Até</span>
            <input type="date" name="ate" defaultValue={ate} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Regime</span>
            <select name="regime" defaultValue={regime} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
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
      </Card>

      {!temDados ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento no período escolhido.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <tbody>
              {/* Receitas */}
              <SecaoHeader titulo="Receitas" />
              {dre.receitas.map((r) => (
                <Linha
                  key={`r-${r.id}`}
                  nome={r.name}
                  valor={fmt(r.total)}
                  href={drill({ tipo: "income", categoria: r.id })}
                />
              ))}
              {dre.receitaSemCategoria > 0 && (
                <Linha nome="Sem categoria" valor={fmt(dre.receitaSemCategoria)} suave />
              )}
              <LinhaTotal nome="Total de receitas" valor={fmt(dre.totalReceitas)} tom="income" href={drill({ tipo: "income" })} />

              {/* Despesas */}
              <SecaoHeader titulo="Despesas" />
              {dre.despesas.map((d) => (
                <Linha
                  key={`d-${d.id ?? "sem"}`}
                  nome={d.name}
                  valor={fmt(d.total)}
                  href={d.id ? drill({ tipo: "expense", centro: d.id }) : drill({ tipo: "expense" })}
                />
              ))}
              {dre.despesaSemCategoria > 0 && (
                <Linha nome="Sem centro de custo" valor={fmt(dre.despesaSemCategoria)} suave />
              )}
              <LinhaTotal nome="Total de despesas" valor={fmt(dre.totalDespesas)} tom="expense" href={drill({ tipo: "expense" })} />

              {/* Resultado */}
              <tr className="border-t-2 border-border bg-surface-muted/40 transition-colors hover:bg-surface-muted">
                <td className="px-5 py-4 text-base font-semibold">
                  Resultado {dre.resultado >= 0 ? "(superávit)" : "(déficit)"}
                </td>
                <td className="px-0 py-0 text-right">
                  <Link
                    href={drill({})}
                    className={cn(
                      "tabular block px-5 py-4 text-base font-bold hover:underline",
                      dre.resultado >= 0 ? "text-income" : "text-expense",
                    )}
                  >
                    {fmt(dre.resultado)}
                  </Link>
                </td>
              </tr>
              {dre.margem !== null && (
                <tr className="bg-surface-muted/40">
                  <td className="px-5 pb-4 text-xs text-muted-foreground">
                    Margem — quanto do que entrou sobrou
                  </td>
                  <td className="tabular px-5 pb-4 text-right text-xs font-medium text-muted-foreground">
                    {dre.margem >= 0 ? "+" : ""}
                    {dre.margem}%
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function SecaoHeader({ titulo }: { titulo: string }) {
  return (
    <tr className="border-b border-border bg-surface-muted/60">
      <td colSpan={2} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </td>
    </tr>
  );
}

function Linha({
  nome,
  valor,
  suave,
  href,
}: {
  nome: string;
  valor: string;
  suave?: boolean;
  href?: string;
}) {
  return (
    <tr className={cn("border-b border-border/60", href && "transition-colors hover:bg-surface-muted")}>
      <td className={cn("px-5 py-2.5", suave && "text-muted-foreground")}>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 hover:underline" title={`Ver lançamentos de ${nome}`}>
            {nome}
            <ChevronRight className="size-3 text-muted-foreground" />
          </Link>
        ) : (
          nome
        )}
      </td>
      <td className="px-0 py-0 text-right">
        {href ? (
          <Link href={href} className={cn("tabular block px-5 py-2.5 hover:underline", suave && "text-muted-foreground")}>
            {valor}
          </Link>
        ) : (
          <span className={cn("tabular block px-5 py-2.5", suave && "text-muted-foreground")}>{valor}</span>
        )}
      </td>
    </tr>
  );
}

function LinhaTotal({
  nome,
  valor,
  tom,
  href,
}: {
  nome: string;
  valor: string;
  tom: "income" | "expense";
  href?: string;
}) {
  return (
    <tr className={cn("border-b border-border font-semibold", href && "transition-colors hover:bg-surface-muted")}>
      <td className="px-5 py-3">{nome}</td>
      <td className="px-0 py-0 text-right">
        {href ? (
          <Link href={href} className={cn("tabular block px-5 py-3 hover:underline", tom === "income" ? "text-income" : "text-expense")}>
            {valor}
          </Link>
        ) : (
          <span className={cn("tabular block px-5 py-3", tom === "income" ? "text-income" : "text-expense")}>{valor}</span>
        )}
      </td>
    </tr>
  );
}
