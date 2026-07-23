"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, CreditCard } from "lucide-react";
import { createTransfer, type TransferState } from "../actions";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

type Conta = {
  id: string;
  name: string;
  currency: CurrencyCode;
  type: string;
};

/** Presets mudam os rótulos e a pré-seleção, mas a ação é a mesma transferência. */
type Preset = "transferencia" | "fatura";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

export function TransferForm({
  contas,
  hoje,
  preset = "transferencia",
}: {
  contas: Conta[];
  hoje: string;
  preset?: Preset;
}) {
  const [state, formAction] = useActionState<TransferState, FormData>(
    createTransfer,
    {},
  );

  const cartoes = contas.filter((c) => c.type === "credit_card");
  const naoCartoes = contas.filter((c) => c.type !== "credit_card");

  // No pagamento de fatura, o destino é o cartão e a origem uma conta comum.
  const [fromId, setFromId] = useState(
    preset === "fatura" ? (naoCartoes[0]?.id ?? "") : (contas[0]?.id ?? ""),
  );
  const [toId, setToId] = useState(
    preset === "fatura"
      ? (cartoes[0]?.id ?? "")
      : (contas[1]?.id ?? contas[0]?.id ?? ""),
  );

  const origem = contas.find((c) => c.id === fromId);
  const moeda = origem?.currency ?? "BRL";

  const ehFatura = preset === "fatura";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="fromAccountId" value={fromId} />
      <input type="hidden" name="toAccountId" value={toId} />

      {state.error && <Alert>{state.error}</Alert>}

      <Card className="space-y-4 p-5">
        <Field
          label={ehFatura ? "Pagar com" : "De (sai desta conta)"}
          htmlFor="from"
          error={state.fieldErrors?.fromAccountId}
        >
          <Select
            id="from"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            invalid={!!state.fieldErrors?.fromAccountId}
          >
            {(ehFatura ? naoCartoes : contas).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex justify-center">
          <span className="grid size-8 place-items-center rounded-full bg-surface-muted text-muted-foreground">
            <ArrowDown className="size-4" />
          </span>
        </div>

        <Field
          label={ehFatura ? "Fatura do cartão" : "Para (entra nesta conta)"}
          htmlFor="to"
          error={state.fieldErrors?.toAccountId}
        >
          <Select
            id="to"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            invalid={!!state.fieldErrors?.toAccountId}
          >
            {(ehFatura ? cartoes : contas).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <Field label="Valor" htmlFor="amount" error={state.fieldErrors?.amount}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCIES[moeda].symbol}
            </span>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0,00"
              required
              className="tabular pl-10 text-lg font-semibold"
              invalid={!!state.fieldErrors?.amount}
            />
          </div>
        </Field>

        <Field label="Data" htmlFor="date" error={state.fieldErrors?.date}>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={hoje}
            required
            invalid={!!state.fieldErrors?.date}
          />
        </Field>

        <Field label="Descrição" htmlFor="description" hint="Opcional.">
          <Input
            id="description"
            name="description"
            placeholder={
              ehFatura ? "Ex.: Fatura de julho" : "Ex.: Guardar na poupança"
            }
          />
        </Field>
      </Card>

      {ehFatura && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CreditCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          O pagamento sai da conta escolhida e abate o saldo devedor do cartão.
          Não conta como despesa — o gasto já foi lançado quando você usou o
          cartão.
        </p>
      )}

      <div className="flex justify-end">
        <Submit label={ehFatura ? "Registrar pagamento" : "Transferir"} />
      </div>
    </form>
  );
}
