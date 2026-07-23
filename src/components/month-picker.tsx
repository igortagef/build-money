"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarRange, RotateCcw } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * Escolha do mês de análise do painel. Navega por ‹ / › e permite pular para
 * qualquer mês pelo seletor nativo. Tudo vira o parâmetro `?mes=YYYY-MM`, então
 * o estado mora na URL — recarregar ou compartilhar o link preserva o período.
 * O regime (competência/caixa) é mantido ao trocar de mês.
 */
export function MonthPicker({
  mes,
  regime,
  ehAtual,
}: {
  mes: string; // "YYYY-MM"
  regime: "competencia" | "caixa";
  ehAtual: boolean;
}) {
  const router = useRouter();

  const ir = (novoMes: string | null) => {
    const params = new URLSearchParams();
    if (novoMes) params.set("mes", novoMes);
    if (regime === "caixa") params.set("regime", "caixa");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const desloca = (delta: number) => {
    const [ano, m] = mes.split("-").map(Number);
    const d = new Date(ano, m - 1 + delta, 1);
    ir(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const rotuloBruto = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(mes.split("-")[0]), Number(mes.split("-")[1]) - 1, 1));
  // Só a inicial maiúscula ("Julho de 2026"), nunca cada palavra.
  const rotulo = rotuloBruto.charAt(0).toUpperCase() + rotuloBruto.slice(1);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
        <button
          type="button"
          onClick={() => desloca(-1)}
          aria-label="Mês anterior"
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* O input nativo fica por cima, invisível, para abrir o calendário de
            mês do sistema; o rótulo bonito aparece embaixo. */}
        <label className="relative flex cursor-pointer items-center gap-1.5 px-2 text-sm font-medium">
          <CalendarRange className="size-4 text-primary-text" aria-hidden />
          {rotulo}
          <input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && ir(e.target.value)}
            aria-label="Escolher mês da análise"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>

        <button
          type="button"
          onClick={() => desloca(1)}
          aria-label="Próximo mês"
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {!ehAtual && (
        <button
          type="button"
          onClick={() => ir(null)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5",
            "text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
          )}
          title="Voltar ao mês atual"
        >
          <RotateCcw className="size-3.5" />
          Hoje
        </button>
      )}
    </div>
  );
}
