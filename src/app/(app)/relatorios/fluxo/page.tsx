import { AlertTriangle, TrendingDown } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getFluxoProjetado } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { Card, cn } from "@/components/ui";
import { RelatoriosNav } from "../nav";

export const metadata = { title: "Fluxo de caixa projetado · Build Money" };

export default async function FluxoPage(props: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const sp = await props.searchParams;
  const meses = Math.min(Math.max(Number(sp.meses) || 6, 3), 12);

  const { ledgerId, baseCurrency } = await requireAccess();
  const f = await getFluxoProjetado(ledgerId, meses);
  const fmt = (v: number) => formatMoney(v, baseCurrency);

  const temPrevistos = f.meses.some((m) => m.entradas > 0 || m.saidas > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <RelatoriosNav atual="fluxo" />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fluxo de caixa projetado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A partir do saldo de hoje, projeta o caixa somando o que está previsto:
          contas fixas, parcelas e receitas provisionadas. Usa a data de caixa — o
          cartão pesa no vencimento da fatura.
        </p>
      </div>

      {/* Saldo de partida e horizonte */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Saldo de caixa hoje</p>
          <p className="tabular mt-1 text-2xl font-semibold">{fmt(f.saldoInicial)}</p>
        </Card>
        <div className="flex gap-1">
          {[3, 6, 12].map((n) => (
            <a
              key={n}
              href={`/relatorios/fluxo?meses=${n}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                meses === n
                  ? "bg-primary-subtle text-primary-text"
                  : "text-muted-foreground hover:bg-surface-muted",
              )}
            >
              {n} meses
            </a>
          ))}
        </div>
      </div>

      {/* Alerta de aperto de caixa */}
      {f.mesNegativo && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-expense/25 bg-expense-subtle px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-expense" />
          <div className="text-sm">
            <p className="font-medium text-expense">
              O caixa fica negativo em {f.mesNegativo.rotulo}.
            </p>
            <p className="text-muted-foreground">
              Saldo projetado de {fmt(f.mesNegativo.saldoProjetado)} — antecipe uma
              entrada ou adie uma saída.
            </p>
          </div>
        </div>
      )}

      {!temPrevistos && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum lançamento previsto no horizonte. Cadastre contas fixas ou provisione
          receitas futuras para ver a projeção ganhar forma. Enquanto isso, o caixa
          segue em {fmt(f.saldoInicial)}.
        </Card>
      )}

      <FluxoGrafico meses={f.meses} currency={baseCurrency} />

      {/* Tabela */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Mês</th>
              <th className="px-4 py-3 text-right font-semibold">Entradas</th>
              <th className="px-4 py-3 text-right font-semibold">Saídas</th>
              <th className="px-4 py-3 text-right font-semibold">Resultado</th>
              <th className="px-4 py-3 text-right font-semibold">Saldo projetado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {f.meses.map((m) => (
              <tr key={m.mes}>
                <td className="px-4 py-2.5 font-medium">{m.rotulo}</td>
                <td className="tabular px-4 py-2.5 text-right text-income">
                  {m.entradas > 0 ? fmt(m.entradas) : "—"}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-expense">
                  {m.saidas > 0 ? fmt(m.saidas) : "—"}
                </td>
                <td
                  className={cn(
                    "tabular px-4 py-2.5 text-right",
                    m.resultado > 0 && "text-income",
                    m.resultado < 0 && "text-expense",
                  )}
                >
                  {m.resultado !== 0 ? fmt(m.resultado) : "—"}
                </td>
                <td
                  className={cn(
                    "tabular px-4 py-2.5 text-right font-semibold",
                    m.saldoProjetado < 0 ? "text-expense" : "text-foreground",
                  )}
                >
                  {fmt(m.saldoProjetado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingDown className="size-3.5" />
        Menor saldo no período: {fmt(f.menorSaldo.saldoProjetado)} em {f.menorSaldo.rotulo}.
      </p>
    </div>
  );
}

/**
 * Gráfico do saldo projetado: uma linha do saldo mês a mês sobre uma faixa que
 * marca o zero. SVG no servidor, sem biblioteca no cliente.
 */
function FluxoGrafico({
  meses,
  currency,
}: {
  meses: Awaited<ReturnType<typeof getFluxoProjetado>>["meses"];
  currency: "BRL" | "USD" | "EUR";
}) {
  const W = 640;
  const H = 200;
  const PAD = 28;
  const saldos = meses.map((m) => m.saldoProjetado);
  const max = Math.max(...saldos, 0);
  const min = Math.min(...saldos, 0);
  const span = max - min || 1;

  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(meses.length - 1, 1);
  const y = (v: number) => PAD + ((max - v) / span) * (H - 2 * PAD);
  const yZero = y(0);

  const pontos = meses.map((m, i) => `${x(i)},${y(m.saldoProjetado)}`).join(" ");

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Saldo projetado</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução do saldo projetado">
        {/* Linha do zero */}
        <line x1={PAD} y1={yZero} x2={W - PAD} y2={yZero} stroke="var(--color-border)" strokeDasharray="4 4" />
        <text x={PAD} y={yZero - 4} className="fill-[var(--color-muted-foreground)]" fontSize="10">
          0
        </text>
        {/* Linha do saldo */}
        <polyline points={pontos} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
        {meses.map((m, i) => (
          <g key={m.mes}>
            <circle
              cx={x(i)}
              cy={y(m.saldoProjetado)}
              r="3.5"
              className={m.saldoProjetado < 0 ? "fill-[var(--color-expense)]" : "fill-[var(--color-primary)]"}
            >
              <title>{`${m.rotulo}: ${formatMoney(m.saldoProjetado, currency)}`}</title>
            </circle>
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--color-muted-foreground)]" fontSize="10">
              {m.rotulo}
            </text>
          </g>
        ))}
      </svg>
    </Card>
  );
}
