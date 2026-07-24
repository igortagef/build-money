"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createAsset, type AssetState } from "../actions";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { FotoPicker } from "@/components/foto-picker";
import { CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import { KIND_LABEL } from "@/lib/asset-kinds";
import type { AssetKind } from "@/db/schema";

type TipoBem = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : "Adicionar ao patrimônio"}
    </Button>
  );
}

export function NewAssetForm({
  baseCurrency,
  tiposBem,
}: {
  baseCurrency: string;
  tiposBem: TipoBem[];
}) {
  const [state, formAction] = useActionState<AssetState, FormData>(createAsset, {});
  // "modo" separa as duas naturezas: investimento (com aporte e rendimento) e
  // bem (só valor). O tipo do bem vem da lista editável em /bens.
  const [modo, setModo] = useState<"investimento" | "bem">("investimento");
  const [invKind, setInvKind] = useState<AssetKind>("fixed_income");
  const [bemKindId, setBemKindId] = useState<string>(tiposBem[0]?.id ?? "");
  const [invested, setInvested] = useState("");
  const [current, setCurrent] = useState("");

  const investimento = modo === "investimento";
  const simbolo = CURRENCIES[baseCurrency as "BRL"]?.symbol ?? "R$";

  const investedCent = parseMoney(invested) ?? 0;
  const currentCent = parseMoney(current) ?? 0;
  const rend = currentCent - investedCent;

  return (
    <form action={formAction} className="space-y-5">
      {/* Para bem, o kind é sempre "other"; o tipo real vai em assetKindId. */}
      <input type="hidden" name="kind" value={investimento ? invKind : "other"} />
      {!investimento && <input type="hidden" name="assetKindId" value={bemKindId} />}

      <div
        className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1"
        role="group"
        aria-label="Natureza do item"
      >
        {(
          [
            { v: "investimento", label: "Investimento" },
            { v: "bem", label: "Bem" },
          ] as const
        ).map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => setModo(v)}
            aria-pressed={modo === v}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold transition-colors",
              modo === v ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="space-y-5 p-5">
        {investimento ? (
          <Field label="Tipo de investimento" htmlFor="invKind">
            <Select
              id="invKind"
              value={invKind}
              onChange={(e) => setInvKind(e.target.value as AssetKind)}
            >
              <option value="fixed_income">{KIND_LABEL.fixed_income}</option>
              <option value="variable_income">{KIND_LABEL.variable_income}</option>
            </Select>
          </Field>
        ) : (
          <Field
            label="Tipo de bem"
            htmlFor="bemKind"
            hint="A lista é editável em Cadastros › Bens."
          >
            {tiposBem.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum tipo cadastrado.{" "}
                <Link href="/bens" className="underline">Crie um em Bens</Link>.
              </p>
            ) : (
              <Select id="bemKind" value={bemKindId} onChange={(e) => setBemKindId(e.target.value)}>
                {tiposBem.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Nome" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            placeholder={
              investimento ? "Ex.: Tesouro Selic 2029" : "Ex.: Apartamento"
            }
            required
            invalid={!!state.fieldErrors?.name}
          />
        </Field>

        <Field
          label="Detalhe"
          htmlFor="detail"
          hint="Opcional: corretora, instituição, identificação."
        >
          <Input
            id="detail"
            name="detail"
            placeholder={investimento ? "Ex.: XP Investimentos" : "Ex.: Rua X, 123"}
          />
        </Field>

        {/* Foto só para bens — dá um detalhe visual (carro, imóvel, joia…). */}
        {!investimento && (
          <Field label="Foto do bem" htmlFor="foto" hint="Opcional. Só para detalhe.">
            <FotoPicker name="foto" label="Adicionar foto" />
          </Field>
        )}
      </Card>

      <Card className="space-y-5 p-5">
        {investimento && (
          <Field
            label="Valor investido (aportado)"
            htmlFor="invested"
            hint="Quanto você colocou. É a base para calcular o rendimento."
            error={state.fieldErrors?.invested}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {simbolo}
              </span>
              <Input
                id="invested"
                name="invested"
                inputMode="decimal"
                placeholder="0,00"
                value={invested}
                onChange={(e) => setInvested(e.target.value)}
                className="tabular pl-10"
              />
            </div>
          </Field>
        )}

        <Field
          label={investimento ? "Valor atual" : "Valor estimado"}
          htmlFor="current"
          hint={
            investimento
              ? "Quanto vale hoje. Você atualiza quando quiser."
              : "Quanto o bem vale hoje."
          }
          error={state.fieldErrors?.current}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {simbolo}
            </span>
            <Input
              id="current"
              name="current"
              inputMode="decimal"
              placeholder="0,00"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="tabular pl-10 text-lg font-semibold"
              invalid={!!state.fieldErrors?.current}
            />
          </div>
        </Field>

        {investimento && investedCent > 0 && currentCent > 0 && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              rend >= 0
                ? "border-income/25 bg-income-subtle text-income"
                : "border-expense/25 bg-expense-subtle text-expense",
            )}
          >
            Rendimento:{" "}
            <strong className="tabular">
              {rend >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(rend), baseCurrency as "BRL")}
            </strong>{" "}
            ({rend >= 0 ? "+" : ""}
            {investedCent > 0 ? Math.round((rend / investedCent) * 1000) / 10 : 0}%)
          </div>
        )}
      </Card>

      {state.error && <Alert>{state.error}</Alert>}

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
