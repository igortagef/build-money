"use client";

import { Trash2 } from "lucide-react";
import { deleteReimbursable } from "./actions";

export function DeleteRachaButton({
  id,
  descricao,
}: {
  id: string;
  descricao: string;
}) {
  return (
    <form
      action={deleteReimbursable}
      onSubmit={(e) => {
        if (
          !confirm(
            `Apagar o racha "${descricao}"?\n\nAs transferências ligadas a ele também somem.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Apagar racha ${descricao}`}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
