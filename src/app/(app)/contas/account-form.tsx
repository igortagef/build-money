"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAccount, updateAccount, type AccountFormState } from "./actions";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { AccountType, CurrencyCode } from "@/db/schema";

const TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "cash", label: "Dinheiro em espécie" },
  { value: "investment", label: "Investimentos" },
] as const;

export type AccountInitial = {
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  institution: string;
  openingBalance: number; // centavos
  creditLimit: number | null;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

const centavosParaInput = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SubmitButton({ editar }: { editar: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : editar ? "Salvar alterações" : "Salvar conta"}
    </Button>
  );
}

export function AccountForm({
  mode,
  accountId,
  initial,
}: {
  mode: "create" | "edit";
  accountId?: string;
  initial?: AccountInitial;
}) {
  const editar = mode === "edit";
  const [state, formAction] = useActionState<AccountFormState, FormData>(
    editar ? updateAccount : createAccount,
    {},
  );

  const [type, setType] = useState<string>(initial?.type ?? "checking");
  const [nome, setNome] = useState(initial?.name ?? "");
  const [instituicao, setInstituicao] = useState(initial?.institution ?? "");

  const isCreditCard = type === "credit_card";

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        {editar && accountId && <input type="hidden" name="id" value={accountId} />}
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Nome da conta" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Nubank, Carteira, Itaú"
            required
            invalid={!!state.fieldErrors?.name}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="type" error={state.fieldErrors?.type}>
            <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} invalid={!!state.fieldErrors?.type}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Moeda" htmlFor="currency">
            <Select id="currency" name="currency" defaultValue={initial?.currency ?? "BRL"}>
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.symbol} · {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Instituição" htmlFor="institution" hint="Opcional." error={state.fieldErrors?.institution}>
          <Input
            id="institution"
            name="institution"
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            placeholder="Ex.: Banco do Brasil"
          />
        </Field>

        <Field
          label={isCreditCard ? "Saldo devedor atual" : "Saldo atual"}
          htmlFor="openingBalance"
          hint={
            isCreditCard
              ? "Quanto já está usado na fatura aberta. Deixe zerado se não souber."
              : "Quanto há na conta hoje. Os lançamentos partem daqui."
          }
          error={state.fieldErrors?.openingBalance}
        >
          <Input
            id="openingBalance"
            name="openingBalance"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={initial ? centavosParaInput(initial.openingBalance) : "0,00"}
            invalid={!!state.fieldErrors?.openingBalance}
          />
        </Field>

        {isCreditCard && (
          <div className="space-y-5 rounded-lg border border-border bg-surface-muted p-4">
            <p className="text-xs font-medium text-muted-foreground">Dados do cartão</p>
            <Field label="Limite" htmlFor="creditLimit" hint="Opcional." error={state.fieldErrors?.creditLimit}>
              <Input
                id="creditLimit"
                name="creditLimit"
                inputMode="decimal"
                placeholder="5.000,00"
                defaultValue={initial?.creditLimit != null ? centavosParaInput(initial.creditLimit) : ""}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dia do fechamento" htmlFor="statementClosingDay" error={state.fieldErrors?.statementClosingDay}>
                <Input
                  id="statementClosingDay"
                  name="statementClosingDay"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="28"
                  defaultValue={initial?.statementClosingDay ?? ""}
                  invalid={!!state.fieldErrors?.statementClosingDay}
                />
              </Field>
              <Field label="Dia do vencimento" htmlFor="paymentDueDay" error={state.fieldErrors?.paymentDueDay}>
                <Input
                  id="paymentDueDay"
                  name="paymentDueDay"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="5"
                  defaultValue={initial?.paymentDueDay ?? ""}
                  invalid={!!state.fieldErrors?.paymentDueDay}
                />
              </Field>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <SubmitButton editar={editar} />
        </div>
      </form>
    </Card>
  );
}
