"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Pencil, X } from "lucide-react";
import { updateAssetValue, deleteAsset, type AssetState } from "./actions";
import { Input, cn } from "@/components/ui";
import { CURRENCIES, formatMoney } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

function SalvarBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label="Salvar novo valor"
      disabled={pending}
      className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
    >
      <Check className="size-4" />
    </button>
  );
}

/**
 * Valor atual editável inline. Ao salvar, grava um snapshot — é o que
 * atualiza a evolução mensal do patrimônio.
 */
export function ValorAtualEditavel({
  id,
  valor,
  currency,
}: {
  id: string;
  valor: number;
  currency: CurrencyCode;
}) {
  const [state, formAction] = useActionState<AssetState, FormData>(updateAssetValue, {});
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="group inline-flex items-center gap-1.5"
        title="Atualizar valor"
      >
        <span className="tabular font-semibold">{formatMoney(valor, currency)}</span>
        <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form
      action={(fd) => {
        formAction(fd);
        setEditando(false);
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <div className="relative w-32">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {CURRENCIES[currency].symbol}
        </span>
        <Input
          autoFocus
          name="current"
          inputMode="decimal"
          defaultValue={(valor / 100).toFixed(2).replace(".", ",")}
          aria-label="Novo valor"
          className={cn("tabular h-8 pl-7 text-right text-sm", state.error && "border-expense")}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditando(false);
          }}
        />
      </div>
      <SalvarBtn />
      <button
        type="button"
        onClick={() => setEditando(false)}
        aria-label="Cancelar"
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}

export function DeleteAssetButton({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={deleteAsset}
      onSubmit={(e) => {
        if (!confirm(`Remover "${nome}" do patrimônio?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Remover ${nome}`}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}
