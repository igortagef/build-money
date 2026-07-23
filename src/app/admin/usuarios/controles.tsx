"use client";

import { CalendarClock } from "lucide-react";
import { editarClassificacao, editarPrazo } from "./actions";
import { CLASSIFICACOES } from "@/lib/user-classificacao";
import { cn } from "@/components/ui";

/**
 * Controles por usuário no console de admin: classificação (salva ao trocar) e
 * prazo de acesso em dias (define `access_until = hoje + dias`; vazio = sem
 * prazo). São server actions chamadas por forms simples.
 */
export function ControlesUsuario({
  id,
  classificacao,
  diasRestantes,
}: {
  id: string;
  classificacao: string | null;
  diasRestantes: number | null;
}) {
  const vencido = diasRestantes !== null && diasRestantes < 0;
  const acabando = diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 7;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Classificação — salva ao selecionar */}
      <form action={editarClassificacao}>
        <input type="hidden" name="id" value={id} />
        <select
          name="classificacao"
          defaultValue={classificacao ?? ""}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          aria-label="Classificação do usuário"
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
        >
          <option value="">Sem classificação</option>
          {CLASSIFICACOES.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </form>

      {/* Prazo de acesso em dias */}
      <form action={editarPrazo} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <div className="relative">
          <CalendarClock
            className={cn(
              "pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2",
              vencido ? "text-expense" : acabando ? "text-warning" : "text-muted-foreground",
            )}
          />
          <input
            type="number"
            name="dias"
            min={0}
            defaultValue={diasRestantes ?? ""}
            placeholder="sem prazo"
            aria-label="Dias de acesso restantes"
            className={cn(
              "w-24 rounded-lg border bg-surface py-1.5 pl-7 pr-2 text-xs tabular text-foreground",
              vencido ? "border-expense/50" : acabando ? "border-warning/50" : "border-border",
            )}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          Definir
        </button>
      </form>
    </div>
  );
}
