"use client";

import { Check } from "lucide-react";
import { toggleReconciled } from "./actions";
import { cn } from "@/components/ui";

/**
 * Conferir um lançamento contra o extrato. Conciliado ganha o dourado da
 * marca — a cor da conquista — porque conciliar é justamente o hábito que o
 * app quer premiar.
 */
export function ReconcileButton({
  id,
  descricao,
  conciliado,
  previsto,
}: {
  id: string;
  descricao: string;
  conciliado: boolean;
  previsto: boolean;
}) {
  // Previsto ainda não aconteceu; não há o que conferir no extrato.
  if (previsto) return <span className="w-8 shrink-0" aria-hidden />;

  return (
    <form action={toggleReconciled}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-pressed={conciliado}
        aria-label={
          conciliado
            ? `Desmarcar ${descricao} como conferido`
            : `Conferir ${descricao} com o extrato`
        }
        title={conciliado ? "Conferido" : "Marcar como conferido"}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
          conciliado
            ? "bg-xp text-xp-foreground"
            : "border border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
        )}
      >
        <Check className="size-4" />
      </button>
    </form>
  );
}
