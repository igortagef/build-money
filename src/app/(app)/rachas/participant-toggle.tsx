"use client";

import { Check } from "lucide-react";
import { togglePaid } from "./actions";
import { cn } from "@/components/ui";

/**
 * Caixinha de "pagou" de cada participante. Marcar move o dinheiro da piscina
 * de volta para a conta; desmarcar desfaz. É a baixa individual do racha.
 */
export function ParticipantToggle({
  participantId,
  nome,
  pago,
}: {
  participantId: string;
  nome: string;
  pago: boolean;
}) {
  return (
    <form action={togglePaid}>
      <input type="hidden" name="participantId" value={participantId} />
      <button
        type="submit"
        aria-pressed={pago}
        aria-label={pago ? `Desmarcar ${nome} como pago` : `Marcar ${nome} como pago`}
        title={pago ? "Pago — clique para desfazer" : "Marcar como pago"}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md border transition-colors",
          pago
            ? "border-income bg-income text-white"
            : "border-border-strong text-transparent hover:border-income",
        )}
      >
        <Check className="size-3.5" />
      </button>
    </form>
  );
}
