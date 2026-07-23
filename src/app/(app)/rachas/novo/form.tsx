"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createReimbursable, type RachaState } from "../actions";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import { splitEvenly } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

type Conta = { id: string; name: string; currency: CurrencyCode };
type Categoria = { id: string; label: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Registrando…" : "Registrar racha"}
    </Button>
  );
}

export function NewRachaForm({
  contas,
  categorias,
  hoje,
}: {
  contas: Conta[];
  categorias: Categoria[];
  hoje: string;
}) {
  const [state, formAction] = useActionState<RachaState, FormData>(
    createReimbursable,
    {},
  );

  const [total, setTotal] = useState("");
  const [minhaParte, setMinhaParte] = useState("");
  type Part = { nome: string; valor: string };
  const [participantes, setParticipantes] = useState<Part[]>([
    { nome: "", valor: "" },
    { nome: "", valor: "" },
  ]);

  const moeda = contas[0]?.currency ?? "BRL";
  const totalCent = parseMoney(total) ?? 0;
  const minhaCent = parseMoney(minhaParte) ?? 0;
  const aReembolsar = Math.max(0, totalCent - minhaCent);
  const temMinhaParte = minhaCent > 0;

  const somaCotas = participantes.reduce((s, p) => s + (parseMoney(p.valor) ?? 0), 0);
  const diferenca = aReembolsar - somaCotas;

  function setPart(i: number, campo: keyof Part, v: string) {
    setParticipantes((ps) => ps.map((p, idx) => (idx === i ? { ...p, [campo]: v } : p)));
  }

  /** Distribui o valor a reembolsar igualmente, sem perder centavo. */
  function dividirIgualmente() {
    if (aReembolsar <= 0) return;
    const cotas = splitEvenly(aReembolsar, participantes.length);
    setParticipantes((ps) =>
      ps.map((p, i) => ({ ...p, valor: (cotas[i] / 100).toFixed(2).replace(".", ",") })),
    );
  }

  function ajustarUltima() {
    if (diferenca === 0) return;
    setParticipantes((ps) => {
      const copia = [...ps];
      const ult = copia.length - 1;
      const atual = parseMoney(copia[ult].valor) ?? 0;
      copia[ult] = { ...copia[ult], valor: ((atual + diferenca) / 100).toFixed(2).replace(".", ",") };
      return copia;
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="pessoas" value={participantes.length} />
      {participantes.map((p, i) => (
        <span key={i} style={{ display: "contents" }}>
          <input type="hidden" name={`nome_${i}`} value={p.nome} />
          <input type="hidden" name={`valor_${i}`} value={p.valor} />
        </span>
      ))}

      {state.error && <Alert>{state.error}</Alert>}

      <Card className="space-y-5 p-5">
        <Field label="O que foi" htmlFor="description" error={state.fieldErrors?.description}>
          <Input
            id="description"
            name="description"
            placeholder="Ex.: Jantar de aniversário"
            required
            invalid={!!state.fieldErrors?.description}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Valor total da compra"
            htmlFor="total"
            hint="O quanto você pagou no total."
            error={state.fieldErrors?.total}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCIES[moeda].symbol}
              </span>
              <Input
                id="total"
                name="total"
                inputMode="decimal"
                placeholder="0,00"
                required
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="tabular pl-10 font-semibold"
                invalid={!!state.fieldErrors?.total}
              />
            </div>
          </Field>

          <Field
            label="Minha parte"
            htmlFor="myShare"
            hint="Quanto foi seu de verdade. Vira despesa."
            error={state.fieldErrors?.myShare}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCIES[moeda].symbol}
              </span>
              <Input
                id="myShare"
                name="myShare"
                inputMode="decimal"
                placeholder="0,00"
                value={minhaParte}
                onChange={(e) => setMinhaParte(e.target.value)}
                className="tabular pl-10"
                invalid={!!state.fieldErrors?.myShare}
              />
            </div>
          </Field>
        </div>

        {temMinhaParte && (
          <Field
            label="Categoria da sua parte"
            htmlFor="categoryId"
            hint="Sua parte entra como despesa nesta categoria."
            error={state.fieldErrors?.categoryId}
          >
            <Select id="categoryId" name="categoryId" invalid={!!state.fieldErrors?.categoryId}>
              <option value="">Selecione…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Saiu de qual conta" htmlFor="accountId" error={state.fieldErrors?.accountId}>
            <Select id="accountId" name="accountId" invalid={!!state.fieldErrors?.accountId}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quando" htmlFor="date" error={state.fieldErrors?.date}>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={hoje}
              required
              invalid={!!state.fieldErrors?.date}
            />
          </Field>
        </div>
      </Card>

      {/* Quem vai reembolsar */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Quem vai reembolsar</p>
            <p className="text-xs text-muted-foreground">
              {aReembolsar > 0
                ? `${formatMoney(aReembolsar, moeda)} a dividir entre ${participantes.length} ${participantes.length === 1 ? "pessoa" : "pessoas"}.`
                : "Informe o valor total para dividir."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setParticipantes((ps) => (ps.length > 1 ? ps.slice(0, -1) : ps))
              }
              aria-label="Menos uma pessoa"
              disabled={participantes.length <= 1}
            >
              −
            </Button>
            <span className="tabular w-6 text-center text-sm font-semibold">
              {participantes.length}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setParticipantes((ps) => (ps.length < 50 ? [...ps, { nome: "", valor: "" }] : ps))
              }
              aria-label="Mais uma pessoa"
            >
              +
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {participantes.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={p.nome}
                onChange={(e) => setPart(i, "nome", e.target.value)}
                placeholder={`Pessoa ${i + 1}`}
                aria-label={`Nome da pessoa ${i + 1}`}
                className="flex-1"
              />
              <div className="relative w-32 shrink-0">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {CURRENCIES[moeda].symbol}
                </span>
                <Input
                  value={p.valor}
                  onChange={(e) => setPart(i, "valor", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={`Valor da pessoa ${i + 1}`}
                  className="tabular pl-8 text-right"
                />
              </div>
            </div>
          ))}
        </div>

        {aReembolsar > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={dividirIgualmente}>
              Dividir igualmente
            </Button>
            {/* Placar: avisa se as partes fecham com o valor a reembolsar. */}
            <span
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                diferenca === 0
                  ? "border-income/25 bg-income-subtle text-income"
                  : "border-warning/25 bg-xp-subtle text-warning",
              )}
              aria-live="polite"
            >
              {diferenca === 0 ? (
                "As partes fecham"
              ) : (
                <>
                  {diferenca > 0 ? "Faltam" : "Passou"}{" "}
                  <strong className="tabular">{formatMoney(Math.abs(diferenca), moeda)}</strong>
                  <button
                    type="button"
                    onClick={ajustarUltima}
                    className="underline underline-offset-2"
                  >
                    ajustar
                  </button>
                </>
              )}
            </span>
          </div>
        )}

        {state.fieldErrors?.participantes && (
          <p className="text-xs text-expense" role="alert">
            {state.fieldErrors.participantes}
          </p>
        )}
      </Card>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
