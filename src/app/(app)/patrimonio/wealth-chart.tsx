import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui";
import type { CurrencyCode } from "@/db/schema";

/**
 * Evolução do patrimônio investido. Barras que "empilham" como tijolos — a
 * metáfora da marca: o patrimônio sobe bloco a bloco. Em SVG no servidor,
 * sem biblioteca de charts no cliente.
 */
export function WealthChart({
  dados,
  currency,
}: {
  dados: Array<{ mes: string; rotulo: string; valor: number }>;
  currency: CurrencyCode;
}) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const temDados = dados.some((d) => d.valor > 0);

  const W = 640;
  const H = 180;
  const PAD = 8;
  const larguraGrupo = W / dados.length;
  const larguraBarra = Math.min(larguraGrupo - 16, 44);

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Evolução dos investimentos</h2>

      {!temDados ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sem investimentos registrados ainda.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução mensal do patrimônio investido">
            {dados.map((d, i) => {
              const centro = i * larguraGrupo + larguraGrupo / 2;
              const h = (d.valor / max) * (H - PAD);
              // Cada barra é uma pilha de "tijolos" com um vão entre eles.
              const ALTURA_TIJOLO = 12;
              const GAP = 3;
              const n = Math.max(1, Math.round(h / (ALTURA_TIJOLO + GAP)));
              return (
                <g key={d.mes}>
                  {Array.from({ length: n }, (_, k) => {
                    const yTop = H - (k + 1) * (ALTURA_TIJOLO + GAP) + GAP;
                    return (
                      <rect
                        key={k}
                        x={centro - larguraBarra / 2}
                        y={Math.max(PAD, yTop)}
                        width={larguraBarra}
                        height={ALTURA_TIJOLO}
                        rx={2}
                        fill="var(--brand-teal)"
                        opacity={0.55 + (k / n) * 0.45}
                        className="bricklay"
                        style={{ animationDelay: `${k * 50}ms` }}
                      />
                    );
                  })}
                  <title>{`${d.rotulo}: ${formatMoney(d.valor, currency)}`}</title>
                </g>
              );
            })}
          </svg>

          <div className="flex">
            {dados.map((d) => (
              <span key={d.mes} className="flex-1 text-center text-xs text-muted-foreground">
                {d.rotulo.replace(".", "")}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
