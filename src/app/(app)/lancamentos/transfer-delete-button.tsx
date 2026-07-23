"use client";

import { Trash2 } from "lucide-react";
import { deleteTransfer } from "../transferencias/actions";

export function TransferDeleteButton({
  pairId,
  descricao,
}: {
  pairId: string;
  descricao: string;
}) {
  return (
    <form
      action={deleteTransfer}
      onSubmit={(e) => {
        // Apagar remove as duas pernas da transferência de uma vez.
        if (!confirm(`Apagar a transferência "${descricao}"?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="pairId" value={pairId} />
      <button
        type="submit"
        aria-label={`Apagar transferência ${descricao}`}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
