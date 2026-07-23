"use client";

import { Trash2 } from "lucide-react";
import { deleteGoal } from "./actions";

export function DeleteGoalButton({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={deleteGoal}
      onSubmit={(e) => {
        // Apagar a meta leva junto o histórico de aportes.
        if (!confirm(`Apagar a meta "${nome}" e seus aportes?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Apagar meta ${nome}`}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
