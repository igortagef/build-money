import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Card, cn } from "./ui";
import type { CurrencyCode } from "@/db/schema";

/**
 * Gráficos em SVG renderizado no servidor: nada de biblioteca de charts no
 * bundle do cliente. O hover usa <title>, que vira dica nativa do navegador e
 * é lida por leitores de tela — sem JavaScript.
 *
 * As cores vêm de --chart-income / --chart-expense, validadas para daltonismo
 * (ver comentário em globals.css). Além da cor, cada série tem legenda e
 * rótulo direto: a identidade nunca depende só da cor.
 */

const MARK_RADIUS = 4;

type PontoMensal = {
  mes: string;
  rotulo: string;
  receitas: number;
  despesas: number;
  resultado: number;
  saldoAcumulado: number;
};

export function MonthlyTrendChart({
  dados,
  currency,
}: {
  dados: PontoMensal[];
  currency: CurrencyCode;
}) {
  const temDados = dados.some((d) => d.receitas > 0 || d.despesas > 0);

  /*
   * O viewBox usa PIXELS, não uma grade de 100 unidades: com 100 unidades
   * esticadas na largura do cartão, o texto do eixo era multiplicado por ~10
   * e virava um título. Aqui 1 unidade = 1 px na altura, e a altura é fixa.
   */
  const W = 640;
  const H = 180;
  const PAD_BAIXO = 22;
  const alturaPlot = H - PAD_BAIXO;
  const larguraGrupo = W / dados.length;
  const larguraBarra = Math.min((larguraGrupo - 14) / 2, 26);

  /*
   * Barras (receita/despesa) e a linha de saldo compartilham UM eixo — tudo é
   * dinheiro, na mesma unidade. Por isso a escala inclui o saldo acumulado, e
   * o zero entra no domínio: o saldo pode ser negativo, e um segundo eixo só
   * para a linha esconderia justamente quando o dinheiro está minguando.
   */
  const acumulados = dados.map((d) => d.saldoAcumulado);
  const topoDominio = Math.max(
    ...dados.flatMap((d) => [d.receitas, d.despesas]),
    ...acumulados,
    1,
  );
  const baseDominio = Math.min(0, ...acumulados);
  const amplitude = topoDominio - baseDominio || 1;
  // Converte um valor em Y (pixel), com folga de 6px no topo.
  const y = (v: number) =>
    6 + ((topoDominio - v) / amplitude) * (alturaPlot - 6);
  const yZero = y(0);

  const pontosLinha = dados
    .map((d, i) => `${i * larguraGrupo + larguraGrupo / 2},${y(d.saldoAcumulado)}`)
    .join(" ");

  return (
    <Card className="overflow-hidden p-0">
      <h2 className="card-titulo px-4 py-2.5 text-center text-sm font-bold">Evolução mensal</h2>
      <div className="p-5">
      <div className="mb-4 flex justify-center">
        <Legenda />
      </div>

      {!temDados ? (
        <Vazio texto="Sem lançamentos nos últimos meses." />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            // Escala uniforme: com preserveAspectRatio="none" a largura
            // esticaria e achataria os cantos arredondados das barras.
            className="w-full"
            role="img"
            aria-label="Receitas e despesas dos últimos meses"
          >
            {/* Linha do zero: a base de onde as barras crescem. */}
            <line
              x1={0}
              y1={yZero}
              x2={W}
              y2={yZero}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />

            {dados.map((d, i) => {
              const centro = i * larguraGrupo + larguraGrupo / 2;
              const topoR = y(d.receitas);
              const topoD = y(d.despesas);
              return (
                <g key={d.mes}>
                  <rect
                    x={centro - larguraBarra - 1}
                    y={topoR}
                    width={larguraBarra}
                    height={Math.max(0, yZero - topoR)}
                    rx={Math.min(MARK_RADIUS, (yZero - topoR) / 2)}
                    fill="var(--chart-income)"
                  >
                    <title>{`${d.rotulo}: receitas ${formatMoney(d.receitas, currency)}`}</title>
                  </rect>
                  <rect
                    x={centro + 1}
                    y={topoD}
                    width={larguraBarra}
                    height={Math.max(0, yZero - topoD)}
                    rx={Math.min(MARK_RADIUS, (yZero - topoD) / 2)}
                    fill="var(--chart-expense)"
                  >
                    <title>{`${d.rotulo}: despesas ${formatMoney(d.despesas, currency)}`}</title>
                  </rect>
                </g>
              );
            })}

            {/* Linha de saldo acumulado. Cor neutra escura, para não se
                confundir com o verde da receita nem o vermelho da despesa. */}
            <polyline
              points={pontosLinha}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.75}
            />
            {dados.map((d, i) => {
              const cx = i * larguraGrupo + larguraGrupo / 2;
              return (
                <circle
                  key={`p-${d.mes}`}
                  cx={cx}
                  cy={y(d.saldoAcumulado)}
                  r={2.5}
                  fill="var(--surface)"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${d.rotulo}: saldo acumulado ${formatMoney(d.saldoAcumulado, currency)}`}</title>
                </circle>
              );
            })}
          </svg>

          {/* Rótulos em HTML, não em <text> do SVG: assim não são esticados
              junto com o desenho e herdam a tipografia da página. */}
          <div className="flex">
            {dados.map((d) => (
              <span
                key={d.mes}
                className="flex-1 text-center text-xs text-muted-foreground"
              >
                {d.rotulo.replace('.', '')}
              </span>
            ))}
          </div>
          {/* Tabela equivalente: o gráfico não pode ser a única via de acesso. */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Ver como tabela
            </summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Mês</th>
                  <th className="py-1 text-right font-medium">Receitas</th>
                  <th className="py-1 text-right font-medium">Despesas</th>
                  <th className="py-1 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((d) => (
                  <tr key={d.mes} className="border-t border-border">
                    <td className="py-1.5">{d.rotulo}</td>
                    <td className="tabular py-1.5 text-right">
                      {formatMoney(d.receitas, currency)}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {formatMoney(d.despesas, currency)}
                    </td>
                    <td className="tabular py-1.5 text-right font-medium">
                      {formatMoney(d.saldoAcumulado, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
      </div>
    </Card>
  );
}

function Legenda() {
  return (
    <div className="flex items-center gap-4 text-xs">
      {[
        { cor: "var(--chart-income)", label: "Receitas", linha: false },
        { cor: "var(--chart-expense)", label: "Despesas", linha: false },
        { cor: "var(--foreground)", label: "Saldo", linha: true },
      ].map(({ cor, label, linha }) => (
        <span key={label} className="flex items-center gap-1.5">
          {linha ? (
            // A série do saldo é uma linha, não uma barra; o símbolo acompanha.
            <span
              aria-hidden
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: cor }}
            />
          ) : (
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: cor }}
            />
          )}
          <span className="text-muted-foreground">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Ranking horizontal — série única, então sem legenda: o título já nomeia. */
export function CategoryRanking({
  titulo,
  dados,
  currency,
  vazio,
}: {
  titulo: string;
  // `href` opcional torna a linha clicável — leva aos lançamentos que a compõem.
  dados: Array<{ name: string; total: number; href?: string }>;
  currency: CurrencyCode;
  vazio: string;
}) {
  const max = Math.max(...dados.map((d) => d.total), 1);
  const totalGeral = dados.reduce((s, d) => s + d.total, 0);

  return (
    <Card className="overflow-hidden p-0">
      <h2 className="card-titulo px-4 py-2.5 text-center text-sm font-bold">{titulo}</h2>
      <div className="p-5">

      {dados.length === 0 ? (
        <Vazio texto={vazio} />
      ) : (
        <ul className="space-y-3">
          {dados.map((d) => {
            const pct = Math.round((d.total / totalGeral) * 100);
            const conteudo = (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm">
                    {d.name}
                    {d.href && (
                      <ChevronRight className="ml-0.5 inline size-3 -translate-y-px text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatMoney(d.total, currency)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {pct}%
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(d.total / max) * 100}%`,
                      backgroundColor: "var(--chart-expense)",
                    }}
                  />
                </div>
              </>
            );
            return (
              <li key={d.href ?? d.name}>
                {d.href ? (
                  <Link
                    href={d.href}
                    className="group block rounded-lg p-1 -m-1 transition-colors hover:bg-surface-muted"
                    title={`Ver lançamentos de ${d.name}`}
                  >
                    {conteudo}
                  </Link>
                ) : (
                  conteudo
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className={cn("py-8 text-center text-sm text-muted-foreground")}>
      {texto}
    </div>
  );
}
