"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createRecurring, type FixaFormState } from "../actions";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import { FREQUENCIA_LABEL } from "@/lib/recurrence";
import type { CurrencyCode, RecurrenceFrequency } from "@/db/schema";

type Conta = { id: string; name: string; currency: CurrencyCode };
type Categoria = { id: string; label: string; type: "income" | "expense" };

const SUGESTOES_DESPESA = ["Aluguel", "Internet", "Plano de saúde", "Energia", "Streaming"];
const SUGESTOES_RECEITA = ["Salário", "Aluguel recebido", "Pró-labore"];

const FREQUENCIAS = Object.keys(FREQUENCIA_LABEL) as RecurrenceFrequency[];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Criando…" : "Criar conta fixa"}
    </Button>
  );
}

export function NewRecurringForm({
  contas,
  categorias,
  baseCurrency,
  hoje,
}: {
  contas: Conta[];
  categorias: Categoria[];
  baseCurrency: CurrencyCode;
  hoje: string;
}) {
  const [state, formAction] = useActionState<FixaFormState, FormData>(
    createRecurring,
    {},
  );

  const [tipo, setTipo] = useState<"expense" | "income">("expense");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [frequencia, setFrequencia] = useState<RecurrenceFrequency>("monthly");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  const conta = contas.find((c) => c.id === contaId);
  const moeda = conta?.currency ?? baseCurrency;

  const opcoes = useMemo(
    () => categorias.filter((c) => c.type === tipo),
    [categorias, tipo],
  );

  // Semanal e quinzenal não têm "dia do mês": elas contam a partir da data
  // de início.
  const precisaDia = !["weekly", "biweekly"].includes(frequencia);
  const sugestoes = tipo === "expense" ? SUGESTOES_DESPESA : SUGESTOES_RECEITA;
  const centavos = parseMoney(valor) ?? 0;

  function trocarTipo(novo: "expense" | "income") {
    setTipo(novo);
    // Planos de receita e despesa são separados; manter a seleção antiga
    // criaria uma regra inválida.
    setCategoriaId("");
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="type" value={tipo} />

      {state.error && <Alert>{state.error}</Alert>}

      <div
        className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1"
        role="group"
        aria-label="Tipo da conta fixa"
      >
        {(
          [
            { v: "expense", label: "Conta a pagar" },
            { v: "income", label: "Conta a receber" },
          ] as const
        ).map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => trocarTipo(v)}
            aria-pressed={tipo === v}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold transition-colors",
              tipo === v
                ? v === "expense"
                  ? "bg-expense text-white shadow-sm"
                  : "bg-income text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="space-y-5 p-5">
        <Field
          label="O que é"
          htmlFor="description"
          error={state.fieldErrors?.description}
        >
          <Input
            id="description"
            name="description"
            placeholder={tipo === "expense" ? "Ex.: Aluguel" : "Ex.: Salário"}
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            invalid={!!state.fieldErrors?.description}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sugestoes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDescricao(s)}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

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
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="tabular pl-10 text-lg font-semibold"
              invalid={!!state.fieldErrors?.amount}
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta" htmlFor="accountId" error={state.fieldErrors?.accountId}>
            <Select
              id="accountId"
              name="accountId"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              invalid={!!state.fieldErrors?.accountId}
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Categoria"
            htmlFor="categoryId"
            error={state.fieldErrors?.categoryId}
          >
            <Select
              id="categoryId"
              name="categoryId"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              invalid={!!state.fieldErrors?.categoryId}
            >
              <option value="">Selecione…</option>
              {opcoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <p className="text-sm font-medium">Quando se repete</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Frequência" htmlFor="frequency">
            <Select
              id="frequency"
              name="frequency"
              value={frequencia}
              onChange={(e) =>
                setFrequencia(e.target.value as RecurrenceFrequency)
              }
            >
              {FREQUENCIAS.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCIA_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>

          {precisaDia && (
            <Field
              label="Dia do vencimento"
              htmlFor="dayOfMonth"
              hint="Em meses curtos, cai no último dia."
              error={state.fieldErrors?.dayOfMonth}
            >
              <Input
                id="dayOfMonth"
                name="dayOfMonth"
                type="number"
                min={1}
                max={31}
                placeholder="10"
                invalid={!!state.fieldErrors?.dayOfMonth}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="A partir de"
            htmlFor="startDate"
            error={state.fieldErrors?.startDate}
          >
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={hoje}
              required
              invalid={!!state.fieldErrors?.startDate}
            />
          </Field>

          <Field
            label="Até"
            htmlFor="endDate"
            hint="Opcional. Deixe vazio se não tem fim."
            error={state.fieldErrors?.endDate}
          >
            <Input
              id="endDate"
              name="endDate"
              type="date"
              invalid={!!state.fieldErrors?.endDate}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            name="autoConfirm"
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium">
              Confirmar automaticamente
            </span>
            <span className="block text-xs text-muted-foreground">
              Para débito automático: no vencimento, vira realizado sozinho.
              Sem isso, você confirma quando pagar.
            </span>
          </span>
        </label>
      </Card>

      {centavos > 0 && frequencia === "monthly" && (
        <div className="rounded-lg border border-primary-border bg-primary-subtle px-3 py-2.5 text-sm text-primary-text">
          Isso soma{" "}
          <strong className="tabular">{formatMoney(centavos * 12, moeda)}</strong>{" "}
          por ano.
        </div>
      )}

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
