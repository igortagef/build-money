"use client";

import { useActionState, useState } from "react";
import { Lock, Check, RefreshCcw, X } from "lucide-react";
import {
  acaoFecharFatura,
  acaoAlternarPaga,
  acaoReparcelar,
  type AcaoFaturaState,
} from "../actions";
import { buttonClasses, cn } from "@/components/ui";
import type { StatusFatura } from "@/lib/faturas";

const inicial: AcaoFaturaState = {};

export function FaturaAcoes({
  accountId,
  dueDate,
  statementId,
  status,
  persistida,
  temAberto,
}: {
  accountId: string;
  dueDate: string;
  statementId: string | null;
  status: StatusFatura;
  persistida: boolean;
  temAberto: boolean;
}) {
  const [fecharState, fecharAction, fechando] = useActionState(acaoFecharFatura, inicial);
  const [pagaState, pagaAction, pagando] = useActionState(acaoAlternarPaga, inicial);
  const [repState, repAction, reparcelando] = useActionState(acaoReparcelar, inicial);
  const [formAberto, setFormAberto] = useState(false);

  const podeFechar = status === "open" || (status === "closed" && !persistida);
  const erro = fecharState.erro || pagaState.erro || repState.erro;

  return (
    <div className="border-t border-border bg-surface-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {podeFechar && (
          <form action={fecharAction}>
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="dueDate" value={dueDate} />
            <button type="submit" disabled={fechando} className={buttonClasses("secondary", "sm")}>
              <Lock className="size-3.5" />
              {fechando ? "Fechando…" : "Fechar fatura"}
            </button>
          </form>
        )}

        {persistida && (status === "closed" || status === "paid") && statementId && (
          <form action={pagaAction}>
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="statementId" value={statementId} />
            <button
              type="submit"
              disabled={pagando}
              className={buttonClasses(status === "paid" ? "ghost" : "secondary", "sm")}
            >
              <Check className="size-3.5" />
              {status === "paid" ? "Paga (desfazer)" : pagando ? "Salvando…" : "Marcar paga"}
            </button>
          </form>
        )}

        {temAberto && status !== "reparcelada" && (
          <button
            type="button"
            onClick={() => setFormAberto((v) => !v)}
            className={buttonClasses("secondary", "sm")}
          >
            <RefreshCcw className="size-3.5" />
            Reparcelar
          </button>
        )}
      </div>

      {formAberto && temAberto && (
        <form
          action={repAction}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="dueDate" value={dueDate} />
          <label className="text-xs font-medium text-muted-foreground">
            Parcelas
            <select
              name="parcelas"
              defaultValue="12"
              className="mt-1 block h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
            >
              {[2, 3, 4, 5, 6, 10, 12, 18, 24, 36, 48].map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Juros/encargos (opcional)
            <input
              name="juros"
              inputMode="decimal"
              placeholder="0,00"
              className="mt-1 block h-9 w-32 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
            />
          </label>
          <button type="submit" disabled={reparcelando} className={buttonClasses("primary", "sm")}>
            {reparcelando ? "Reparcelando…" : "Confirmar reparcelamento"}
          </button>
          <button
            type="button"
            onClick={() => setFormAberto(false)}
            className={buttonClasses("ghost", "sm")}
            aria-label="Cancelar"
          >
            <X className="size-3.5" />
          </button>
          <p className="w-full text-[11px] text-muted-foreground">
            Substitui as parcelas em aberto desta fatura por um novo plano, vinculado a ela.
            As originais ficam no histórico, rastreáveis.
          </p>
        </form>
      )}

      {erro && (
        <p className={cn("mt-2 text-xs font-medium text-expense")} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
