"use client";

import { useMemo, useState } from "react";
import { Plus, X, TrendingUp } from "lucide-react";
import { Button, Card, Input, Select, cn } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";
import { projetar, resumo, anualParaMensal, mensalPctParaFracao } from "@/lib/compound";

type Cenario = {
  key: number;
  nome: string;
  inicial: string;
  mensal: string;
  taxa: string;
  periodoTaxa: "ano" | "mes";
  meses: string;
};

let seq = 1;
const CORES = ["var(--chart-income)", "var(--brand-gold)", "var(--primary)"];

function novoCenario(nome: string, defaults?: Partial<Cenario>): Cenario {
  return {
    key: seq++,
    nome,
    inicial: "1.000,00",
    mensal: "300,00",
    taxa: "10",
    periodoTaxa: "ano",
    meses: "120",
    ...defaults,
  };
}

export function CalculadoraJuros() {
  const [cenarios, setCenarios] = useState<Cenario[]>([
    novoCenario("Cenário A"),
    novoCenario("Cenário B", { taxa: "14", nome: "Cenário B" }),
  ]);

  function atualizar(key: number, campo: keyof Cenario, valor: string) {
    setCenarios((cs) => cs.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)));
  }

  const calculados = useMemo(
    () =>
      cenarios.map((c, idx) => {
        const inicial = parseMoney(c.inicial) ?? 0;
        const mensal = parseMoney(c.mensal) ?? 0;
        const taxaPct = Number(c.taxa.replace(",", ".")) || 0;
        const taxaMensal =
          c.periodoTaxa === "ano" ? anualParaMensal(taxaPct) : mensalPctParaFracao(taxaPct);
        const meses = Math.max(1, Math.min(600, Math.round(Number(c.meses) || 0)));
        const pontos = projetar(inicial, mensal, taxaMensal, meses);
        return { cenario: c, cor: CORES[idx % CORES.length], pontos, r: resumo(pontos) };
      }),
    [cenarios],
  );

  // Escala comum entre os cenários, para o comparativo ser honesto.
  const maxSaldo = Math.max(...calculados.map((c) => c.r.saldoFinal), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {cenarios.map((c, idx) => (
          <Card key={c.key} className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-3 rounded-full"
                style={{ backgroundColor: CORES[idx % CORES.length] }}
              />
              <input
                value={c.nome}
                onChange={(e) => atualizar(c.key, "nome", e.target.value)}
                aria-label={`Nome do cenário ${idx + 1}`}
                className="flex-1 bg-transparent text-sm font-semibold focus:outline-none"
              />
              {cenarios.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCenarios((cs) => cs.filter((x) => x.key !== c.key))}
                  aria-label={`Remover ${c.nome}`}
                  className="grid size-6 place-items-center rounded text-muted-foreground hover:text-expense"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Valor inicial" value={c.inicial} onChange={(v) => atualizar(c.key, "inicial", v)} money />
              <Campo label="Aporte mensal" value={c.mensal} onChange={(v) => atualizar(c.key, "mensal", v)} money />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Rentabilidade
                </label>
                <div className="flex gap-1">
                  <Input
                    value={c.taxa}
                    onChange={(e) => atualizar(c.key, "taxa", e.target.value)}
                    inputMode="decimal"
                    aria-label={`Taxa do ${c.nome}`}
                    className="tabular"
                  />
                  <Select
                    value={c.periodoTaxa}
                    onChange={(e) => atualizar(c.key, "periodoTaxa", e.target.value)}
                    aria-label={`Período da taxa do ${c.nome}`}
                    className="w-24"
                  >
                    <option value="ano">% a.a.</option>
                    <option value="mes">% a.m.</option>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Prazo (meses)
                </label>
                <Input
                  value={c.meses}
                  onChange={(e) => atualizar(c.key, "meses", e.target.value)}
                  inputMode="numeric"
                  aria-label={`Prazo do ${c.nome}`}
                  className="tabular"
                />
              </div>
            </div>

            {/* Resultado do cenário */}
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <Resultado label="Investido" valor={calculados[idx].r.investido} />
              <Resultado label="Juros" valor={calculados[idx].r.juros} destaque />
              <Resultado label="Total" valor={calculados[idx].r.saldoFinal} forte />
            </div>
          </Card>
        ))}
      </div>

      {cenarios.length < 3 && (
        <Button
          variant="secondary"
          onClick={() =>
            setCenarios((cs) => [...cs, novoCenario(`Cenário ${String.fromCharCode(65 + cs.length)}`)])
          }
        >
          <Plus className="size-4" />
          Comparar outro cenário
        </Button>
      )}

      {/* Comparativo: torres de tijolos, a metáfora da marca */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <TrendingUp className="size-4 text-primary-text" aria-hidden />
          Comparativo
        </h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Cada torre é um cenário: os tijolos claros são o que você investe, os
          escuros são os juros que o dinheiro rende sozinho.
        </p>

        <div className="flex items-end justify-around gap-4" style={{ minHeight: 220 }}>
          {calculados.map(({ cenario, cor, r }) => {
            const alturaMax = 200;
            const hTotal = (r.saldoFinal / maxSaldo) * alturaMax;
            const hInvestido = r.saldoFinal > 0 ? (r.investido / r.saldoFinal) * hTotal : 0;
            const hJuros = hTotal - hInvestido;
            return (
              <div key={cenario.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="tabular text-sm font-semibold">
                  {formatMoney(r.saldoFinal, "BRL")}
                </span>
                <Torre altura={hTotal} hInvestido={hInvestido} hJuros={hJuros} cor={cor} />
                <span className="max-w-full truncate text-xs font-medium">{cenario.nome}</span>
                <span className="text-[11px] text-muted-foreground">
                  {r.percentualJuros}% em juros
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/**
 * Torre de tijolos. Os blocos "empilham" com uma animação escalonada, a
 * metáfora do Build Money: patrimônio construído bloco a bloco.
 */
function Torre({
  altura,
  hInvestido,
  hJuros,
  cor,
}: {
  altura: number;
  hInvestido: number;
  hJuros: number;
  cor: string;
}) {
  const ALTURA_TIJOLO = 12;
  const GAP = 2;
  const nInvestido = Math.max(1, Math.round(hInvestido / (ALTURA_TIJOLO + GAP)));
  const nJuros = Math.max(0, Math.round(hJuros / (ALTURA_TIJOLO + GAP)));
  const tijolos = [
    ...Array.from({ length: nInvestido }, () => "investido" as const),
    ...Array.from({ length: nJuros }, () => "juros" as const),
  ];

  return (
    <div
      className="flex w-16 flex-col-reverse items-center gap-0.5"
      style={{ height: altura }}
      role="img"
      aria-label={`Torre com ${nInvestido} blocos investidos e ${nJuros} de juros`}
    >
      {tijolos.map((tipo, i) => (
        <span
          key={i}
          className={cn(
            "w-full rounded-sm bricklay",
            tipo === "juros" ? "opacity-100" : "opacity-45",
          )}
          style={{
            height: ALTURA_TIJOLO,
            backgroundColor: cor,
            // Empilha de baixo para cima, um bloco após o outro.
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  money,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  money?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        {money && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            R$
          </span>
        )}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          aria-label={label}
          className={cn("tabular", money && "pl-9")}
        />
      </div>
    </div>
  );
}

function Resultado({
  label,
  valor,
  destaque,
  forte,
}: {
  label: string;
  valor: number;
  destaque?: boolean;
  forte?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular text-sm",
          forte ? "font-bold" : "font-medium",
          destaque && "text-primary-text",
        )}
      >
        {formatMoney(valor, "BRL")}
      </p>
    </div>
  );
}
