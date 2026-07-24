"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Card, cn } from "./ui";
import type { CurrencyCode } from "@/db/schema";

/**
 * Gráficos em SVG. A interação (hover com tooltip) roda no cliente; a cor vem de
 * --chart-income / --chart-expense (validadas para daltonismo). Cada série tem
 * legenda e rótulo direto — a identidade nunca depende só da cor. A tabela
 * equivalente e as dicas garantem acesso sem depender do desenho.
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
  const [hover, setHover] = useState<number | null>(null);
  const temDados = dados.some((d) => d.receitas > 0 || d.despesas > 0);

  // Totais do período: o que o usuário pediu para ver de cara.
  const totalReceitas = dados.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas = dados.reduce((s, d) => s + d.despesas, 0);
  const resultadoPeriodo = totalReceitas - totalDespesas;
  const saldoFinal = dados.length ? dados[dados.length - 1].saldoAcumulado : 0;

  const W = 640;
  const H = 180;
  const PAD_BAIXO = 22;
  const alturaPlot = H - PAD_BAIXO;
  const larguraGrupo = W / Math.max(dados.length, 1);
  const larguraBarra = Math.min((larguraGrupo - 14) / 2, 26);

  const acumulados = dados.map((d) => d.saldoAcumulado);
  const topoDominio = Math.max(...dados.flatMap((d) => [d.receitas, d.despesas]), ...acumulados, 1);
  const baseDominio = Math.min(0, ...acumulados);
  const amplitude = topoDominio - baseDominio || 1;
  const y = (v: number) => 6 + ((topoDominio - v) / amplitude) * (alturaPlot - 6);
  const yZero = y(0);

  const pontosLinha = dados
    .map((d, i) => `${i * larguraGrupo + larguraGrupo / 2},${y(d.saldoAcumulado)}`)
    .join(" ");

  const ativo = hover !== null ? dados[hover] : null;

  return (
    <Card className="overflow-hidden p-0">
      <h2 className="card-titulo px-4 py-2.5 text-center text-sm font-bold">Evolução mensal</h2>
      <div className="p-5">
        {/* Totais do período */}
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <TotalItem label="Entradas" valor={totalReceitas} currency={currency} cor="text-income" />
          <TotalItem label="Saídas" valor={totalDespesas} currency={currency} cor="text-expense" />
          <TotalItem
            label="Saldo do período"
            valor={resultadoPeriodo}
            currency={currency}
            cor={resultadoPeriodo >= 0 ? "text-income" : "text-expense"}
          />
        </div>

        <div className="mb-3 flex justify-center">
          <Legenda />
        </div>

        {!temDados ? (
          <Vazio texto="Sem lançamentos nos últimos meses." />
        ) : (
          <>
            <div className="relative">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label="Receitas e despesas dos últimos meses"
              >
                <line x1={0} y1={yZero} x2={W} y2={yZero} stroke="var(--chart-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

                {/* Guia vertical no mês sob o mouse */}
                {hover !== null && (
                  <line
                    x1={hover * larguraGrupo + larguraGrupo / 2}
                    y1={0}
                    x2={hover * larguraGrupo + larguraGrupo / 2}
                    y2={alturaPlot}
                    stroke="var(--chart-grid)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {dados.map((d, i) => {
                  const centro = i * larguraGrupo + larguraGrupo / 2;
                  const topoR = y(d.receitas);
                  const topoD = y(d.despesas);
                  const apagado = hover !== null && hover !== i;
                  return (
                    <g key={d.mes} opacity={apagado ? 0.35 : 1}>
                      <rect x={centro - larguraBarra - 1} y={topoR} width={larguraBarra} height={Math.max(0, yZero - topoR)} rx={Math.min(MARK_RADIUS, (yZero - topoR) / 2)} fill="var(--chart-income)" />
                      <rect x={centro + 1} y={topoD} width={larguraBarra} height={Math.max(0, yZero - topoD)} rx={Math.min(MARK_RADIUS, (yZero - topoD) / 2)} fill="var(--chart-expense)" />
                    </g>
                  );
                })}

                <polyline points={pontosLinha} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.75} />
                {dados.map((d, i) => (
                  <circle key={`p-${d.mes}`} cx={i * larguraGrupo + larguraGrupo / 2} cy={y(d.saldoAcumulado)} r={hover === i ? 4 : 2.5} fill="var(--surface)" stroke="var(--foreground)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>

              {/* Zonas de hover (uma por mês) sobre o gráfico */}
              <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
                {dados.map((d, i) => (
                  <button
                    key={`z-${d.mes}`}
                    type="button"
                    aria-label={`${d.rotulo}: receitas ${formatMoney(d.receitas, currency)}, despesas ${formatMoney(d.despesas, currency)}, saldo ${formatMoney(d.saldoAcumulado, currency)}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    className="flex-1 cursor-default"
                  />
                ))}
              </div>

              {/* Tooltip do mês sob o mouse */}
              {ativo && (
                <div
                  data-testid="tooltip-mes"
                  className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
                  style={{ left: `${((hover! + 0.5) / dados.length) * 100}%` }}
                >
                  <p className="mb-1 font-semibold">{ativo.rotulo}</p>
                  <p className="flex items-center justify-between gap-3 text-income">
                    <span>Entradas</span>
                    <span className="tabular font-medium">{formatMoney(ativo.receitas, currency)}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3 text-expense">
                    <span>Saídas</span>
                    <span className="tabular font-medium">{formatMoney(ativo.despesas, currency)}</span>
                  </p>
                  <p className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1 text-foreground">
                    <span>Saldo</span>
                    <span className="tabular font-semibold">{formatMoney(ativo.saldoAcumulado, currency)}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex">
              {dados.map((d, i) => (
                <span key={d.mes} className={cn("flex-1 text-center text-xs", hover === i ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {d.rotulo.replace(".", "")}
                </span>
              ))}
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver como tabela</summary>
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
                      <td className="tabular py-1.5 text-right">{formatMoney(d.receitas, currency)}</td>
                      <td className="tabular py-1.5 text-right">{formatMoney(d.despesas, currency)}</td>
                      <td className="tabular py-1.5 text-right font-medium">{formatMoney(d.saldoAcumulado, currency)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="tabular py-1.5 text-right text-income">{formatMoney(totalReceitas, currency)}</td>
                    <td className="tabular py-1.5 text-right text-expense">{formatMoney(totalDespesas, currency)}</td>
                    <td className="tabular py-1.5 text-right">{formatMoney(saldoFinal, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}

function TotalItem({ label, valor, currency, cor }: { label: string; valor: number; currency: CurrencyCode; cor: string }) {
  return (
    <div className="rounded-lg bg-surface-muted/50 px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular text-sm font-semibold sm:text-base", cor)}>{formatMoney(valor, currency)}</p>
    </div>
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
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ backgroundColor: cor }} />
          ) : (
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: cor }} />
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
  dados: Array<{ name: string; total: number; href?: string }>;
  currency: CurrencyCode;
  vazio: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...dados.map((d) => d.total), 1);
  const totalGeral = dados.reduce((s, d) => s + d.total, 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="card-titulo flex items-center justify-between gap-2 px-4 py-2.5">
        <h2 className="flex-1 text-center text-sm font-bold">{titulo}</h2>
      </div>
      <div className="p-5">
        {dados.length === 0 ? (
          <Vazio texto={vazio} />
        ) : (
          <>
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Total: <strong className="tabular text-foreground">{formatMoney(totalGeral, currency)}</strong>
            </p>
            <ul className="space-y-3">
              {dados.map((d) => {
                const pct = Math.round((d.total / totalGeral) * 100);
                const realce = hover === (d.href ?? d.name);
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
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(d.total / max) * 100}%`,
                          backgroundColor: "var(--chart-expense)",
                          opacity: hover && !realce ? 0.5 : 1,
                        }}
                      />
                    </div>
                  </>
                );
                return (
                  <li
                    key={d.href ?? d.name}
                    onMouseEnter={() => setHover(d.href ?? d.name)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {d.href ? (
                      <Link href={d.href} className="group block -m-1 rounded-lg p-1 transition-colors hover:bg-surface-muted" title={`Ver lançamentos de ${d.name}`}>
                        {conteudo}
                      </Link>
                    ) : (
                      conteudo
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className={cn("py-8 text-center text-sm text-muted-foreground")}>{texto}</div>;
}
