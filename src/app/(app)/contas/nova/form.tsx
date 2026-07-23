"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAccount, type AccountFormState } from "../actions";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  cn,
} from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import { BANCOS } from "@/lib/banks";
import { BankIcon } from "@/components/bank-icon";

const TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "cash", label: "Dinheiro em espécie" },
  { value: "investment", label: "Investimentos" },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : "Salvar conta"}
    </Button>
  );
}

export function NewAccountForm() {
  const [state, formAction] = useActionState<AccountFormState, FormData>(
    createAccount,
    {},
  );
  const [type, setType] = useState<string>("checking");
  const [nome, setNome] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [bancoId, setBancoId] = useState("");

  const isCreditCard = type === "credit_card";
  const bancoSel = BANCOS.find((b) => b.id === bancoId);

  const escolherBanco = (id: string) => {
    if (id === bancoId) {
      // Clicar de novo desmarca.
      setBancoId("");
      return;
    }
    const b = BANCOS.find((x) => x.id === id);
    setBancoId(id);
    if (b) {
      setInstituicao(b.nome);
      if (!nome.trim()) setNome(b.nome);
    }
  };

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        {state.error && <Alert>{state.error}</Alert>}

        {/* Bancos: cor + sigla (não é o logotipo oficial). Escolher preenche a
            instituição e sugere o nome; dá para pular e digitar manualmente. */}
        <Field label="Banco" htmlFor="bank" hint="Opcional — escolha para dar cor e ícone à conta.">
          <div className="flex flex-wrap gap-2">
            {BANCOS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => escolherBanco(b.id)}
                aria-pressed={bancoId === b.id}
                title={b.nome}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                  bancoId === b.id
                    ? "border-primary bg-primary-subtle text-primary-text"
                    : "border-border hover:border-border-strong",
                )}
              >
                <BankIcon bankId={b.id} size="sm" className="size-6 text-[9px]" />
                {b.nome}
              </button>
            ))}
          </div>
          <input type="hidden" name="bank" value={bancoId} />
          <input type="hidden" name="color" value={bancoSel?.cor ?? ""} />
        </Field>

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
            <Select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              invalid={!!state.fieldErrors?.type}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Moeda" htmlFor="currency">
            <Select id="currency" name="currency" defaultValue="BRL">
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.symbol} · {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Instituição"
          htmlFor="institution"
          hint="Opcional."
          error={state.fieldErrors?.institution}
        >
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
            defaultValue="0,00"
            invalid={!!state.fieldErrors?.openingBalance}
          />
        </Field>

        {isCreditCard && (
          <div className="space-y-5 rounded-lg border border-border bg-surface-muted p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Dados do cartão
            </p>

            <Field
              label="Limite"
              htmlFor="creditLimit"
              hint="Opcional."
              error={state.fieldErrors?.creditLimit}
            >
              <Input
                id="creditLimit"
                name="creditLimit"
                inputMode="decimal"
                placeholder="5.000,00"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Dia do fechamento"
                htmlFor="statementClosingDay"
                error={state.fieldErrors?.statementClosingDay}
              >
                <Input
                  id="statementClosingDay"
                  name="statementClosingDay"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="28"
                  invalid={!!state.fieldErrors?.statementClosingDay}
                />
              </Field>

              <Field
                label="Dia do vencimento"
                htmlFor="paymentDueDay"
                error={state.fieldErrors?.paymentDueDay}
              >
                <Input
                  id="paymentDueDay"
                  name="paymentDueDay"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="5"
                  invalid={!!state.fieldErrors?.paymentDueDay}
                />
              </Field>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </Card>
  );
}
