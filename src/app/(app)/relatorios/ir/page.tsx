import Link from "next/link";
import { Download, Info } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getRelatorioIR } from "@/lib/ir";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { RelatoriosNav } from "../nav";

export const metadata = { title: "Relatório de IR · Build Money" };

function anoValido(a: string | undefined): number {
  const n = Number(a);
  const atual = new Date().getFullYear();
  if (Number.isInteger(n) && n >= 2000 && n <= atual) return n;
  // Por padrão, o ano anterior — é o que se declara.
  return atual - 1;
}

export default async function IRPage(props: {
  searchParams: Promise<{ ano?: string }>;
}) {
  const { ano: anoParam } = await props.searchParams;
  const ano = anoValido(anoParam);
  const { ledgerId, baseCurrency } = await requireAccess();
  const ir = await getRelatorioIR(ledgerId, ano);
  const fmt = (v: number) => formatMoney(v, baseCurrency);

  const anoAtual = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <RelatoriosNav atual="ir" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Imposto de Renda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rendimentos do ano e a posição de bens e dívidas em 31/12/{ano}.
          </p>
        </div>
        <a href={`/relatorios/ir/exportar?ano=${ano}`} className={buttonClasses("secondary", "sm")}>
          <Download className="size-4" />
          Exportar (CSV)
        </a>
      </div>

      {/* Seletor de ano */}
      <div className="flex items-center gap-2">
        <Link href={`/relatorios/ir?ano=${ano - 1}`} className={buttonClasses("secondary", "sm")}>
          ‹ {ano - 1}
        </Link>
        <span className="min-w-24 text-center text-lg font-semibold">{ano}</span>
        <Link
          href={ano + 1 <= anoAtual ? `/relatorios/ir?ano=${ano + 1}` : `/relatorios/ir?ano=${ano}`}
          aria-disabled={ano + 1 > anoAtual}
          className={cn(buttonClasses("secondary", "sm"), ano + 1 > anoAtual && "pointer-events-none opacity-40")}
        >
          {ano + 1} ›
        </Link>
      </div>

      <div className="flex items-start gap-2 rounded-card border border-primary-border bg-primary-subtle p-3 text-xs text-primary-text">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Auxílio para preencher a declaração — não substitui os informes oficiais dos
          bancos e corretoras. Contas usam o saldo em 31/12; investimentos e bens usam o
          valor cadastrado.
        </p>
      </div>

      <Secao titulo="Rendimentos recebidos no ano">
        {ir.rendimentos.length === 0 ? (
          <Vazio texto="Nenhum rendimento registrado neste ano." />
        ) : (
          <Tabela
            linhas={ir.rendimentos.map((r) => ({ nome: r.name ?? "Sem categoria", tipo: "", valor: r.total }))}
            total={ir.totalRendimentos}
            fmt={fmt}
            comTipo={false}
          />
        )}
      </Secao>

      <Secao titulo="Bens e direitos em 31/12">
        {ir.bens.length === 0 ? (
          <Vazio texto="Nenhum bem ou saldo positivo registrado." />
        ) : (
          <Tabela linhas={ir.bens} total={ir.totalBens} fmt={fmt} comTipo />
        )}
      </Secao>

      <Secao titulo="Dívidas e ônus em 31/12">
        {ir.dividas.length === 0 ? (
          <Vazio texto="Nenhuma dívida registrada. 🎉" />
        ) : (
          <Tabela linhas={ir.dividas} total={ir.totalDividas} fmt={fmt} comTipo tom="expense" />
        )}
      </Secao>

      <Card className="flex items-center justify-between p-5">
        <span className="font-semibold">Patrimônio líquido em 31/12</span>
        <span
          className={cn(
            "tabular text-lg font-bold",
            ir.patrimonioLiquido >= 0 ? "text-income" : "text-expense",
          )}
        >
          {fmt(ir.patrimonioLiquido)}
        </span>
      </Card>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
      {children}
    </div>
  );
}

function Tabela({
  linhas,
  total,
  fmt,
  comTipo,
  tom = "neutral",
}: {
  linhas: Array<{ nome: string; tipo: string; valor: number }>;
  total: number;
  fmt: (v: number) => string;
  comTipo: boolean;
  tom?: "neutral" | "expense";
}) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {linhas.map((l, i) => (
            <tr key={`${l.nome}-${i}`}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{l.nome}</span>
                {comTipo && l.tipo && (
                  <span className="ml-2 text-xs text-muted-foreground">{l.tipo}</span>
                )}
              </td>
              <td className={cn("tabular px-4 py-2.5 text-right", tom === "expense" && "text-expense")}>
                {fmt(l.valor)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-4 py-3">Total</td>
            <td className={cn("tabular px-4 py-3 text-right", tom === "expense" && "text-expense")}>
              {fmt(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <Card className="p-6 text-center text-sm text-muted-foreground">{texto}</Card>
  );
}
