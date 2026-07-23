import { requireAccess } from "@/lib/auth";
import { getBalanco } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { Card, cn } from "@/components/ui";
import { RelatoriosNav } from "../nav";

export const metadata = { title: "Balanço patrimonial · Build Money" };

export default async function BalancoPage() {
  const { ledgerId, baseCurrency } = await requireAccess();
  const b = await getBalanco(ledgerId);
  const fmt = (v: number) => formatMoney(v, baseCurrency);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <RelatoriosNav atual="balanco" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Balanço patrimonial</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uma foto de hoje: tudo o que você tem menos tudo o que você deve.
        </p>
      </div>

      {/* Patrimônio líquido em destaque */}
      <Card className="p-5">
        <p className="text-xs font-medium text-muted-foreground">Patrimônio líquido</p>
        <p
          className={cn(
            "tabular mt-1 text-3xl font-bold",
            b.patrimonioLiquido >= 0 ? "text-foreground" : "text-expense",
          )}
        >
          {fmt(b.patrimonioLiquido)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fmt(b.totalAtivos)} em ativos − {fmt(b.totalPassivos)} em passivos
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Ativos */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border bg-income-subtle/40 px-5 py-3">
            <h2 className="font-semibold text-income">Ativos</h2>
            <p className="text-xs text-muted-foreground">O que você tem</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              <GrupoLinha nome="Dinheiro em contas" valor={fmt(b.caixa)} />
              {b.contasAtivas.map((c) => (
                <SubLinha key={`ca-${c.name}`} nome={c.name} valor={fmt(c.valor)} />
              ))}
              <GrupoLinha nome="Investimentos" valor={fmt(b.investimentos)} />
              <GrupoLinha nome="Bens" valor={fmt(b.bens)} />
              <LinhaTotal nome="Total de ativos" valor={fmt(b.totalAtivos)} tom="income" />
            </tbody>
          </table>
        </Card>

        {/* Passivos */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border bg-expense-subtle/40 px-5 py-3">
            <h2 className="font-semibold text-expense">Passivos</h2>
            <p className="text-xs text-muted-foreground">O que você deve</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {b.contasPassivas.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-5 py-6 text-center text-sm text-muted-foreground">
                    Sem dívidas registradas.
                  </td>
                </tr>
              ) : (
                <>
                  <GrupoLinha nome="Saldos devedores" valor={fmt(b.dividas)} />
                  {b.contasPassivas.map((c) => (
                    <SubLinha key={`cp-${c.name}`} nome={c.name} valor={fmt(c.valor)} />
                  ))}
                </>
              )}
              <LinhaTotal nome="Total de passivos" valor={fmt(b.totalPassivos)} tom="expense" />
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function GrupoLinha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-5 py-2.5 font-medium">{nome}</td>
      <td className="tabular px-5 py-2.5 text-right font-medium">{valor}</td>
    </tr>
  );
}

function SubLinha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-1.5 pl-9 pr-5 text-xs text-muted-foreground">{nome}</td>
      <td className="tabular py-1.5 pl-5 pr-5 text-right text-xs text-muted-foreground">{valor}</td>
    </tr>
  );
}

function LinhaTotal({
  nome,
  valor,
  tom,
}: {
  nome: string;
  valor: string;
  tom: "income" | "expense";
}) {
  return (
    <tr className="border-t-2 border-border font-semibold">
      <td className="px-5 py-3">{nome}</td>
      <td className={cn("tabular px-5 py-3 text-right", tom === "income" ? "text-income" : "text-expense")}>
        {valor}
      </td>
    </tr>
  );
}
