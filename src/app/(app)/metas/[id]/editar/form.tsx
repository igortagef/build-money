"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { editGoal, type MetaFormState } from "../../actions";
import { Alert, Button, Card, Field, Input, buttonClasses } from "@/components/ui";
import { CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : "Salvar alterações"}
    </Button>
  );
}

/** Valor em centavos para o formato do input (ex.: 123456 → "1.234,56"). */
function paraInput(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function EditGoalForm({
  goalId,
  currency,
  guardado,
  initial,
}: {
  goalId: string;
  currency: CurrencyCode;
  guardado: number;
  initial: {
    name: string;
    description: string;
    targetAmount: number;
    targetDate: string | null;
  };
}) {
  const [state, formAction] = useActionState<MetaFormState, FormData>(editGoal, {});

  const [alvo, setAlvo] = useState(paraInput(initial.targetAmount));
  const [data, setData] = useState(initial.targetDate ?? "");

  const alvoCent = parseMoney(alvo) ?? 0;
  const falta = Math.max(0, alvoCent - guardado);
  const jaAtingida = alvoCent > 0 && guardado >= alvoCent;

  // Prévia do esforço mensal (mesma lógica da criação).
  let porMes: number | null = null;
  if (data && falta > 0) {
    const alvoD = new Date(`${data}T12:00:00`);
    const hoje = new Date();
    const meses = Math.max(
      1,
      (alvoD.getFullYear() - hoje.getFullYear()) * 12 + (alvoD.getMonth() - hoje.getMonth()),
    );
    porMes = Math.ceil(falta / meses);
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="goalId" value={goalId} />
        <input type="hidden" name="currency" value={currency} />
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Nome da meta" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={initial.name}
            placeholder="Ex.: Reserva de emergência"
            required
            invalid={!!state.fieldErrors?.name}
          />
        </Field>

        <Field label="Descrição" htmlFor="description" hint="Opcional.">
          <Input
            id="description"
            name="description"
            defaultValue={initial.description}
            placeholder="Ex.: 6 meses de despesas"
          />
        </Field>

        <Field label="Quanto quero juntar" htmlFor="targetAmount" error={state.fieldErrors?.targetAmount}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCIES[currency].symbol}
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
          <p className="mt-1.5 text-xs text-muted-foreground">
            Já guardado:{" "}
            <strong className="tabular text-foreground">{formatMoney(guardado, currency)}</strong>.
            A moeda ({CURRENCIES[currency].label}) não muda aqui para não reinterpretar os aportes.
          </p>
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

        {jaAtingida ? (
          <div className="rounded-lg border border-xp-border bg-xp-subtle px-3 py-2.5 text-sm text-xp-text">
            Com este valor, a meta já conta como <strong>atingida</strong> — você já tem o
            suficiente guardado.
          </div>
        ) : (
          porMes !== null && (
            <div className="rounded-lg border border-primary-border bg-primary-subtle px-3 py-2.5 text-sm text-primary-text">
              Para chegar lá na data, você precisa guardar{" "}
              <strong className="tabular">{formatMoney(porMes, currency)}</strong> por mês.
            </div>
          )
        )}

        <div className="flex justify-end gap-2">
          <Link href="/metas" className={buttonClasses("ghost", "lg")}>
            Cancelar
          </Link>
          <Submit />
        </div>
      </form>
    </Card>
  );
}
