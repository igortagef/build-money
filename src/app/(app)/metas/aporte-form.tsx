"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { addContribution, type MetaFormState } from "./actions";
import { Button, Input } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      <Plus className="size-4" />
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

export function AporteForm({
  goalId,
  currency,
}: {
  goalId: string;
  currency: CurrencyCode;
}) {
  const [state, formAction] = useActionState<MetaFormState, FormData>(
    addContribution,
    {},
  );
  const valorRef = useRef<HTMLInputElement>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  // Aportar é uma ação repetida: depois de guardar, o foco volta ao valor
  // para o usuário lançar o próximo sem tirar a mão do teclado.
  useEffect(() => {
    if (!state.fieldErrors && !state.error) valorRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="date" value={hoje} />

      <div className="flex-1">
        <label
          htmlFor={`aporte-${goalId}`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Guardar um valor
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {CURRENCIES[currency].symbol}
          </span>
          <Input
            ref={valorRef}
            id={`aporte-${goalId}`}
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            className="tabular pl-10"
            invalid={!!state.fieldErrors?.amount}
          />
        </div>
        {state.fieldErrors?.amount && (
          <p className="mt-1 text-xs text-expense" role="alert">
            {state.fieldErrors.amount}
          </p>
        )}
        {state.error && (
          <p className="mt-1 text-xs text-expense" role="alert">
            {state.error}
          </p>
        )}
      </div>

      <Submit />
    </form>
  );
}
