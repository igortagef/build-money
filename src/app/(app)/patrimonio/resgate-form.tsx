"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MinusCircle } from "lucide-react";
import { resgatarInvestimento, type AssetState } from "./actions";
import { Alert, Button, Field, Input, Select, buttonClasses } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

type Conta = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Resgatando…" : "Registrar resgate"}
    </Button>
  );
}

/**
 * Botão + formulário de resgate de um investimento. Ao registrar, cria a
 * transferência (conciliável) de "Investimentos" para a conta escolhida e baixa
 * o valor do ativo. É o inverso do aporte.
 */
export function ResgateForm({
  assetId,
  currency,
  contas,
  hoje,
}: {
  assetId: string;
  currency: CurrencyCode;
  contas: Conta[];
  hoje: string;
}) {
  const [state, formAction] = useActionState<AssetState, FormData>(resgatarInvestimento, {});
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={buttonClasses("ghost", "sm")}>
        <MinusCircle className="size-4" />
        Resgatar
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 w-full space-y-3 rounded-lg border border-border bg-surface-muted/40 p-3">
      <input type="hidden" name="assetId" value={assetId} />
      {state.error && <Alert>{state.error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor do resgate" htmlFor={`resg-valor-${assetId}`} error={state.fieldErrors?.valor}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCIES[currency].symbol}
            </span>
            <Input
              id={`resg-valor-${assetId}`}
              name="valor"
              inputMode="decimal"
              placeholder="0,00"
              required
              className="tabular pl-10 font-semibold"
              invalid={!!state.fieldErrors?.valor}
            />
          </div>
        </Field>

        <Field label="Quando" htmlFor={`resg-data-${assetId}`} error={state.fieldErrors?.date}>
          <Input id={`resg-data-${assetId}`} name="date" type="date" defaultValue={hoje} required />
        </Field>
      </div>

      <Field label="Entrou em qual conta" htmlFor={`resg-conta-${assetId}`} error={state.fieldErrors?.contaDestinoId}>
        <Select id={`resg-conta-${assetId}`} name="contaDestinoId" invalid={!!state.fieldErrors?.contaDestinoId}>
          {contas.length === 0 && <option value="">Nenhuma conta disponível</option>}
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className={buttonClasses("ghost", "sm")}>
          Cancelar
        </button>
        <Submit />
      </div>
    </form>
  );
}
