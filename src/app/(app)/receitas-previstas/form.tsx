"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarClock, Repeat, CheckCircle2 } from "lucide-react";
import {
  provisionarReceitaVariavel,
  provisionarReceitaFixa,
  type ReceitaState,
} from "./actions";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import { FREQUENCIA_LABEL } from "@/lib/recurrence";
import type { CurrencyCode, RecurrenceFrequency } from "@/db/schema";

type Conta = { id: string; name: string; currency: CurrencyCode };
type Categoria = { id: string; label: string };

const FREQUENCIAS = Object.keys(FREQUENCIA_LABEL) as RecurrenceFrequency[];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Provisionando…" : label}
    </Button>
  );
}

export function ProvisionarReceitaForm({
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
  const [modo, setModo] = useState<"variavel" | "fixa">("variavel");

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1"
        role="group"
        aria-label="Tipo de receita futura"
      >
        {(
          [
            { v: "variavel", label: "Variável", Icon: CalendarClock, hint: "uma vez" },
            { v: "fixa", label: "Fixa", Icon: Repeat, hint: "recorrente" },
          ] as const
        ).map(({ v, label, Icon, hint }) => (
          <button
            key={v}
            type="button"
            onClick={() => setModo(v)}
            aria-pressed={modo === v}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors",
              modo === v ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
            <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· {hint}</span>
          </button>
        ))}
      </div>

      {modo === "variavel" ? (
        <FormVariavel contas={contas} categorias={categorias} baseCurrency={baseCurrency} hoje={hoje} />
      ) : (
        <FormFixa contas={contas} categorias={categorias} baseCurrency={baseCurrency} hoje={hoje} />
      )}
    </div>
  );
}

function Sucesso({ texto }: { texto: string }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-income/25 bg-income-subtle px-3 py-2 text-sm text-income">
      <CheckCircle2 className="size-4" />
      {texto}
    </div>
  );
}

function FormVariavel({
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
  const router = useRouter();
  const [state, formAction] = useActionState<ReceitaState, FormData>(
    async (prev, fd) => {
      const r = await provisionarReceitaVariavel(prev, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const conta = contas.find((c) => c.id === contaId);
  const simbolo = CURRENCIES[conta?.currency ?? baseCurrency].symbol;

  return (
    <form action={formAction} className="space-y-5">
      <Card className="space-y-5 p-5">
        {state.ok && <Sucesso texto="Receita prevista provisionada." />}
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="O que você vai receber" htmlFor="v-description" error={state.fieldErrors?.description}>
          <Input id="v-description" name="description" placeholder="Ex.: Freela do projeto X" required invalid={!!state.fieldErrors?.description} />
        </Field>

        <Field label="Valor" htmlFor="v-amount" error={state.fieldErrors?.amount}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{simbolo}</span>
            <Input id="v-amount" name="amount" inputMode="decimal" placeholder="0,00" required className="tabular pl-10 text-lg font-semibold" invalid={!!state.fieldErrors?.amount} />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cai na conta" htmlFor="v-account" error={state.fieldErrors?.accountId}>
            <Select id="v-account" name="accountId" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quando (previsto)" htmlFor="v-date" error={state.fieldErrors?.date}>
            <Input id="v-date" name="date" type="date" defaultValue={hoje} required invalid={!!state.fieldErrors?.date} />
          </Field>
        </div>

        <Field label="Categoria" htmlFor="v-category" hint="Opcional." error={state.fieldErrors?.categoryId}>
          <Select id="v-category" name="categoryId" defaultValue="">
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
      </Card>

      <div className="flex justify-end">
        <Submit label="Provisionar receita" />
      </div>
    </form>
  );
}

function FormFixa({
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
  const router = useRouter();
  const [state, formAction] = useActionState<ReceitaState, FormData>(
    async (prev, fd) => {
      const r = await provisionarReceitaFixa(prev, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [frequencia, setFrequencia] = useState<RecurrenceFrequency>("monthly");
  const conta = contas.find((c) => c.id === contaId);
  const simbolo = CURRENCIES[conta?.currency ?? baseCurrency].symbol;
  const precisaDia = !["weekly", "biweekly"].includes(frequencia);

  return (
    <form action={formAction} className="space-y-5">
      <Card className="space-y-5 p-5">
        {state.ok && <Sucesso texto="Receita fixa criada e provisionada." />}
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="O que você recebe" htmlFor="f-description" error={state.fieldErrors?.description}>
          <Input id="f-description" name="description" placeholder="Ex.: Salário, Aluguel recebido" required invalid={!!state.fieldErrors?.description} />
        </Field>

        <Field label="Valor" htmlFor="f-amount" error={state.fieldErrors?.amount}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{simbolo}</span>
            <Input id="f-amount" name="amount" inputMode="decimal" placeholder="0,00" required className="tabular pl-10 text-lg font-semibold" invalid={!!state.fieldErrors?.amount} />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cai na conta" htmlFor="f-account" error={state.fieldErrors?.accountId}>
            <Select id="f-account" name="accountId" value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria" htmlFor="f-category" hint="Opcional." error={state.fieldErrors?.categoryId}>
            <Select id="f-category" name="categoryId" defaultValue="">
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <p className="text-sm font-medium">Quando se repete</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Frequência" htmlFor="f-frequency">
            <Select id="f-frequency" name="frequency" value={frequencia} onChange={(e) => setFrequencia(e.target.value as RecurrenceFrequency)}>
              {FREQUENCIAS.map((f) => (
                <option key={f} value={f}>{FREQUENCIA_LABEL[f]}</option>
              ))}
            </Select>
          </Field>
          {precisaDia && (
            <Field label="Dia do recebimento" htmlFor="f-dayOfMonth" hint="Em meses curtos, cai no último dia." error={state.fieldErrors?.dayOfMonth}>
              <Input id="f-dayOfMonth" name="dayOfMonth" type="number" min={1} max={31} placeholder="5" invalid={!!state.fieldErrors?.dayOfMonth} />
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="A partir de" htmlFor="f-startDate" error={state.fieldErrors?.startDate}>
            <Input id="f-startDate" name="startDate" type="date" defaultValue={hoje} required invalid={!!state.fieldErrors?.startDate} />
          </Field>
          <Field label="Até" htmlFor="f-endDate" hint="Opcional." error={state.fieldErrors?.endDate}>
            <Input id="f-endDate" name="endDate" type="date" invalid={!!state.fieldErrors?.endDate} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Submit label="Provisionar receita fixa" />
      </div>
    </form>
  );
}
