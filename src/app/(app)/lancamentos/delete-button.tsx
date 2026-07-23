"use client";

import { Trash2 } from "lucide-react";
import { deleteTransaction } from "./actions";

export function DeleteButton({
  id,
  descricao,
}: {
  id: string;
  descricao: string;
}) {
  return (
    <form
      action={deleteTransaction}
      onSubmit={(e) => {
        // Apagar lançamento é irreversível; vale a pergunta.
        if (!confirm(`Apagar "${descricao}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Apagar ${descricao}`}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
