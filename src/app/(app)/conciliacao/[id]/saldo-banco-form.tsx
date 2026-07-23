"use client";

import { useActionState } from "react";
import { Landmark } from "lucide-react";
import { conferirSaldoBanco, type SaldoBancoState } from "../actions";
import { Alert, buttonClasses } from "@/components/ui";

/**
 * Informa o saldo que o extrato do banco mostra numa data. A comparação com o
 * saldo do app aparece no card acima, depois que a ação grava.
 */
export function SaldoBancoForm({
  accountId,
  dataPadrao,
}: {
  accountId: string;
  dataPadrao: string;
}) {
  const [state, action, pendente] = useActionState<SaldoBancoState, FormData>(
    conferirSaldoBanco,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      {state.erro && <Alert>{state.erro}</Alert>}
      {state.ok && (
        <p role="status" className="text-xs font-medium text-income">
          Saldo do banco registrado.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-muted-foreground">
          Na data
          <input
            type="date"
            name="data"
            defaultValue={dataPadrao}
            required
            className="mt-1 block rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          O extrato fecha em
          <input
            name="saldo"
            inputMode="decimal"
            placeholder="1.234,56"
            required
            className="mt-1 block w-40 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <button type="submit" disabled={pendente} className={buttonClasses("primary", "sm")}>
          <Landmark className="size-4" />
          {pendente ? "Conferindo…" : "Conferir saldo"}
        </button>
      </div>
    </form>
  );
}
