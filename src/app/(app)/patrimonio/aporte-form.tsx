"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { PlusCircle } from "lucide-react";
import { aportarInvestimento, type AssetState } from "./actions";
import { Alert, Button, Field, Input, Select, buttonClasses } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

type Conta = { id: string; name: string };
type Meta = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Aportando…" : "Registrar aporte"}
    </Button>
  );
}

/**
 * Botão + formulário de aporte de um investimento. Ao registrar, cria a
 * transferência (conciliável) da conta escolhida para "Investimentos" e, se
 * uma meta for escolhida, avança a meta com o mesmo dinheiro.
 */
export function AporteForm({
  assetId,
  currency,
  contas,
  metas,
  hoje,
}: {
  assetId: string;
  currency: CurrencyCode;
  contas: Conta[];
  metas: Meta[];
  hoje: string;
}) {
  const [state, formAction] = useActionState<AssetState, FormData>(aportarInvestimento, {});
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={buttonClasses("secondary", "sm")}>
        <PlusCircle className="size-4" />
        Aportar
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg border border-border bg-surface-muted/40 p-3">
      <input type="hidden" name="assetId" value={assetId} />
      {state.error && <Alert>{state.error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor do aporte" htmlFor={`valor-${assetId}`} error={state.fieldErrors?.valor}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCIES[currency].symbol}
            </span>
            <Input
              id={`valor-${assetId}`}
              name="valor"
              inputMode="decimal"
              placeholder="0,00"
              required
              className="tabular pl-10 font-semibold"
              invalid={!!state.fieldErrors?.valor}
            />
          </div>
        </Field>

        <Field label="Quando" htmlFor={`data-${assetId}`} error={state.fieldErrors?.date}>
          <Input id={`data-${assetId}`} name="date" type="date" defaultValue={hoje} required />
        </Field>
      </div>

      <Field label="Saiu de qual conta" htmlFor={`conta-${assetId}`} error={state.fieldErrors?.contaOrigemId}>
        <Select id={`conta-${assetId}`} name="contaOrigemId" invalid={!!state.fieldErrors?.contaOrigemId}>
          {contas.length === 0 && <option value="">Nenhuma conta disponível</option>}
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Contar para uma meta? (opcional)"
        htmlFor={`meta-${assetId}`}
        hint="O mesmo dinheiro avança a meta escolhida, sem contar duas vezes."
      >
        <Select id={`meta-${assetId}`} name="metaId">
          <option value="">Não vincular</option>
          {metas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
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
