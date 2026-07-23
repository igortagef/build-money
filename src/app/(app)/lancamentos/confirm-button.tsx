"use client";

import { CalendarCheck } from "lucide-react";
import { confirmPending } from "../contas-fixas/actions";

/**
 * Confirma um lançamento previsto: ele saiu do "vai acontecer" para o
 * "aconteceu". Só aparece no que está previsto.
 */
export function ConfirmButton({
  id,
  descricao,
}: {
  id: string;
  descricao: string;
}) {
  return (
    <form action={confirmPending}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Confirmar ${descricao} como realizado`}
        title="Confirmar que aconteceu"
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary-border text-primary-text transition-colors hover:bg-primary-subtle"
      >
        <CalendarCheck className="size-4" />
      </button>
    </form>
  );
}
