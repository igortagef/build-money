"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createGoal, type MetaFormState } from "../actions";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

const SUGESTOES = [
  "Reserva de emergência",
  "Viagem",
  "Entrada do imóvel",
  "Troca de carro",
  "Curso",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Criando…" : "Criar meta"}
    </Button>
  );
}

export function NewGoalForm({ baseCurrency }: { baseCurrency: CurrencyCode }) {
  const [state, formAction] = useActionState<MetaFormState, FormData>(
    createGoal,
    {},
  );

  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [inicial, setInicial] = useState("");
  const [data, setData] = useState("");
  const [moeda, setMoeda] = useState<CurrencyCode>(baseCurrency);

  const alvoCent = parseMoney(alvo) ?? 0;
  const inicialCent = parseMoney(inicial) ?? 0;
  const falta = Math.max(0, alvoCent - inicialCent);

  // Prévia do esforço mensal: o número que decide se a meta é realista.
  let porMes: number | null = null;
  if (data && falta > 0) {
    const alvoD = new Date(`${data}T12:00:00`);
    const hoje = new Date();
    const meses = Math.max(
      1,
      (alvoD.getFullYear() - hoje.getFullYear()) * 12 +
        (alvoD.getMonth() - hoje.getMonth()),
    );
    porMes = Math.ceil(falta / meses);
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Nome da meta" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            placeholder="Ex.: Reserva de emergência"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            invalid={!!state.fieldErrors?.name}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNome(s)}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Descrição"
          htmlFor="description"
          hint="Opcional."
        >
          <Input
            id="description"
            name="description"
            placeholder="Ex.: 6 meses de despesas"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Quanto quero juntar"
            htmlFor="targetAmount"
            error={state.fieldErrors?.targetAmount}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCIES[moeda].symbol}
              </span>
              <Input
                id="targetAmount"
                name="targetAmount"
                inputMode="decimal"
                placeholder="0,00"
                required
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                className="tabular pl-10 font-semibold"
                invalid={!!state.fieldErrors?.targetAmount}
              />
            </div>
          </Field>

          <Field label="Moeda" htmlFor="currency">
            <Select
              id="currency"
              name="currency"
              value={moeda}
              onChange={(e) => setMoeda(e.target.value as CurrencyCode)}
            >
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.symbol} · {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Quanto já tenho guardado"
          htmlFor="aporteInicial"
          hint="Se já começou a juntar, a meta parte daqui."
          error={state.fieldErrors?.aporteInicial}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCIES[moeda].symbol}
            </span>
            <Input
              id="aporteInicial"
              name="aporteInicial"
              inputMode="decimal"
              placeholder="0,00"
              value={inicial}
              onChange={(e) => setInicial(e.target.value)}
              className="tabular pl-10"
              invalid={!!state.fieldErrors?.aporteInicial}
            />
          </div>
        </Field>

        <Field
          label="Data alvo"
          htmlFor="targetDate"
          hint="Opcional. Serve para calcular quanto guardar por mês."
          error={state.fieldErrors?.targetDate}
        >
          <Input
            id="targetDate"
            name="targetDate"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            invalid={!!state.fieldErrors?.targetDate}
          />
        </Field>

        {porMes !== null && (
          <div className="rounded-lg border border-primary-border bg-primary-subtle px-3 py-2.5 text-sm text-primary-text">
            Para chegar lá na data, você precisa guardar{" "}
            <strong className="tabular">{formatMoney(porMes, moeda)}</strong> por
            mês.
          </div>
        )}

        <div className="flex justify-end">
          <Submit />
        </div>
      </form>
    </Card>
  );
}
