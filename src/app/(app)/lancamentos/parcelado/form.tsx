"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CreditCard } from "lucide-react";
import { createInstallment, type ParceladoState } from "./actions";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import { gerarParcelas } from "@/lib/installments";
import type { CurrencyCode } from "@/db/schema";

type Conta = {
  id: string;
  name: string;
  currency: CurrencyCode;
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};
type Categoria = { id: string; label: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Lançando…" : "Lançar parcelas"}
    </Button>
  );
}

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function NewInstallmentForm({
  contas,
  categorias,
  hoje,
}: {
  contas: Conta[];
  categorias: Categoria[];
  hoje: string;
}) {
  const [state, formAction] = useActionState<ParceladoState, FormData>(
    createInstallment,
    {},
  );

  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [total, setTotal] = useState("");
  const [parcelas, setParcelas] = useState("12");
  const [primeiraData, setPrimeiraData] = useState(hoje);

  const conta = contas.find((c) => c.id === contaId);
  const moeda = conta?.currency ?? "BRL";
  const totalCent = parseMoney(total) ?? 0;
  const nParcelas = Number(parcelas) || 0;

  const ehCartao = conta?.type === "credit_card";

  // Prévia real, calculada com a MESMA função do servidor: o usuário vê
  // exatamente as parcelas que serão criadas, incluindo o ajuste de centavos
  // e o vencimento no cartão. Depende só de primitivos (o React Compiler
  // recusa memoizar sobre o objeto `conta`, que é recriado a cada render).
  const previa = useMemo(() => {
    if (totalCent <= 0 || nParcelas < 2 || !conta) return [];
    try {
      return gerarParcelas(totalCent, nParcelas, primeiraData, {
        type: conta.type,
        statementClosingDay: conta.statementClosingDay,
        paymentDueDay: conta.paymentDueDay,
      });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCent, nParcelas, primeiraData, contaId]);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Alert>{state.error}</Alert>}

      <Card className="space-y-5 p-5">
        <Field
          label="O que você comprou"
          htmlFor="description"
          error={state.fieldErrors?.description}
        >
          <Input
            id="description"
            name="description"
            placeholder="Ex.: Geladeira"
            required
            invalid={!!state.fieldErrors?.description}
          />
        </Field>

        <Field
          label="Valor total"
          htmlFor="total"
          hint="O valor cheio da compra. As parcelas são divididas automaticamente."
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
              className="tabular pl-10 text-lg font-semibold"
              invalid={!!state.fieldErrors?.total}
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Em quantas vezes"
            htmlFor="parcelas"
            error={state.fieldErrors?.parcelas}
          >
            <div className="flex items-center gap-2">
              <Input
                id="parcelas"
                name="parcelas"
                type="number"
                min={2}
                max={120}
                required
                value={parcelas}
                onChange={(e) => setParcelas(e.target.value)}
                className="tabular"
                invalid={!!state.fieldErrors?.parcelas}
              />
              {totalCent > 0 && nParcelas >= 2 && (
                <span className="tabular whitespace-nowrap text-sm text-muted-foreground">
                  de {formatMoney(Math.ceil(totalCent / nParcelas), moeda)}
                </span>
              )}
            </div>
          </Field>

          <Field
            label={ehCartao ? "1ª parcela (competência)" : "Vencimento da 1ª"}
            htmlFor="primeiraData"
            error={state.fieldErrors?.primeiraData}
          >
            <Input
              id="primeiraData"
              name="primeiraData"
              type="date"
              required
              value={primeiraData}
              onChange={(e) => setPrimeiraData(e.target.value)}
              invalid={!!state.fieldErrors?.primeiraData}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta / cartão" htmlFor="accountId" error={state.fieldErrors?.accountId}>
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
            <Select id="categoryId" name="categoryId" invalid={!!state.fieldErrors?.categoryId}>
              <option value="">Selecione…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {ehCartao && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CreditCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            No cartão, cada parcela sai da conta no vencimento da fatura do mês
            correspondente — é isso que aparece no fluxo de caixa.
          </p>
        )}
      </Card>

      {/* Prévia: mostra as parcelas exatas antes de criar */}
      {previa.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-sm font-medium">
            {previa.length} parcelas ·{" "}
            <span className="tabular text-muted-foreground">
              total {formatMoney(totalCent, moeda)}
            </span>
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {previa.map((p) => (
              <div
                key={p.numero}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm odd:bg-surface-muted/50"
              >
                <span className="text-muted-foreground">
                  {p.numero}/{previa.length}
                </span>
                <span>
                  {DATA.format(new Date(`${p.dataCaixa}T12:00:00`))}
                </span>
                <span className="tabular font-medium">
                  {formatMoney(p.valor, moeda)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Todas entram como previstas. Confirme cada uma quando pagar.
          </p>
        </Card>
      )}

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
