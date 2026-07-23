"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setBudget, type OrcamentoState } from "./actions";
import { Input, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

type Item = {
  categoryId: string;
  nome: string;
  caminho: string;
  ehGrupo: boolean;
  orcado: number;
  herdado: boolean;
  gasto: number;
  restante: number;
  percentual: number;
  estourou: boolean;
  perto: boolean;
};

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="sr-only"
      aria-label="Salvar limite"
      disabled={pending}
    >
      Salvar
    </button>
  );
}

/**
 * Texto do campo de limite. Usa o mesmo formato que o usuário digita
 * ("1.000,00", com separador de milhar) — sem isso o campo devolveria
 * "1000,00" e pareceria que o valor foi alterado.
 */
function textoDoValor(centavos: number, currency: CurrencyCode) {
  return centavos > 0
    ? formatMoney(centavos, currency, { showSymbol: false })
    : "";
}

export function BudgetRow(props: {
  item: Item;
  mes: string;
  currency: CurrencyCode;
}) {
  /*
   * A `key` amarra o estado do campo ao valor que veio do servidor: quando o
   * orçamento muda (outro mês, ou o servidor confirmou a gravação), o React
   * recria a linha já com o valor certo.
   *
   * A alternativa — sincronizar com um efeito que chama setState — dispara
   * renderização em cascata a cada atualização, e é o que o lint acusa.
   */
  return (
    <BudgetRowInterno
      key={`${props.mes}:${props.item.orcado}`}
      {...props}
    />
  );
}

function BudgetRowInterno({
  item,
  mes,
  currency,
}: {
  item: Item;
  mes: string;
  currency: CurrencyCode;
}) {
  const [, formAction] = useActionState<OrcamentoState, FormData>(setBudget, {});
  const inicial = textoDoValor(item.orcado, currency);
  const [valor, setValor] = useState(inicial);

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm", item.ehGrupo && "font-medium")}>
            {item.caminho}
          </p>
          {item.orcado > 0 && (
            <p className="tabular text-xs text-muted-foreground">
              {formatMoney(item.gasto, currency)} de{" "}
              {formatMoney(item.orcado, currency)}
              {item.herdado && (
                <span title="Valor herdado do mês anterior; edite para mudar só este mês.">
                  {" "}
                  · repetido
                </span>
              )}
            </p>
          )}
        </div>

        {item.orcado > 0 && (
          <span
            className={cn(
              "tabular shrink-0 text-xs font-semibold",
              item.estourou
                ? "text-expense"
                : item.perto
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            {item.estourou
              ? `${formatMoney(-item.restante, currency)} acima`
              : `restam ${formatMoney(item.restante, currency)}`}
          </span>
        )}

        <form action={formAction} className="w-32 shrink-0">
          <input type="hidden" name="categoryId" value={item.categoryId} />
          <input type="hidden" name="month" value={mes} />
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="sem limite"
            aria-label={`Limite mensal de ${item.caminho}`}
            className="tabular h-9 text-right text-sm"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            // Salva ao sair do campo: um botão por linha em 73 categorias
            // seria ruído, e Enter também envia.
            onBlur={(e) => {
              if (e.target.value !== inicial) e.target.form?.requestSubmit();
            }}
          />
          <Salvar />
        </form>
      </div>

      {item.orcado > 0 && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={Math.min(100, item.percentual)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uso do limite de ${item.caminho}`}
        >
          <div
            // `perto` e `estourou` vêm decididos do servidor: o limiar mora
            // em budgets.ts, que é server-only. Importá-lo aqui contaminaria
            // o bundle do cliente e derrubaria a página inteira.
            className={cn(
              "h-full rounded-full transition-all",
              item.estourou
                ? "bg-expense"
                : item.perto
                  ? "bg-warning"
                  : "bg-primary",
            )}
            style={{ width: `${Math.min(100, item.percentual)}%` }}
          />
        </div>
      )}
    </div>
  );
}
