"use client";

import { Pause, Play, Trash2 } from "lucide-react";
import { toggleRecurring, deleteRecurring } from "./actions";
import { cn } from "@/components/ui";

export function AcoesFixa({
  id,
  descricao,
  ativa,
}: {
  id: string;
  descricao: string;
  ativa: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <form action={toggleRecurring}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          aria-label={ativa ? `Pausar ${descricao}` : `Reativar ${descricao}`}
          title={
            ativa
              ? "Pausar — some do fluxo previsto, o histórico fica"
              : "Reativar"
          }
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          {ativa ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      </form>

      <form
        action={deleteRecurring}
        onSubmit={(e) => {
          if (
            !confirm(
              `Apagar a conta fixa "${descricao}"?\n\nAs parcelas previstas somem. As que você já confirmou continuam no histórico.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          aria-label={`Apagar ${descricao}`}
          className={cn(
            "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors",
            "hover:bg-expense-subtle hover:text-expense",
          )}
        >
          <Trash2 className="size-4" />
        </button>
      </form>
    </div>
  );
}
