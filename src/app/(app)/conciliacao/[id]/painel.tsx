"use client";

import { useState } from "react";
import { Check, Sparkles, Receipt, ArrowLeftRight } from "lucide-react";
import { conciliarLinha, criarEConciliar, criarTransferenciaEConciliar } from "../ofx-actions";
import { formatMoney } from "@/lib/money";
import { buttonClasses, cn } from "@/components/ui";
import type { CurrencyCode } from "@/db/schema";

type Categoria = { id: string; label: string };
type Conta = { id: string; name: string };
type Sugestao = {
  ids: string[];
  description: string;
  date: string;
  amount: number;
  confianca: "alta" | "media";
  racha?: boolean;
} | null;

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const d = (iso: string) => DATA.format(new Date(`${iso}T12:00:00`));

/**
 * Painel do lado "App" de uma linha do extrato. Mostra o par sugerido (se
 * houver) e, abaixo, as formas de tratar a linha manualmente: criar um
 * lançamento novo ou lançar uma transferência entre contas. (Buscar um
 * lançamento existente entra numa etapa seguinte.)
 */
export function PainelConciliacao({
  linhaId,
  accountId,
  descricaoInicial,
  currency,
  sugestao,
  sugestaoCat,
  categorias,
  contas,
}: {
  linhaId: string;
  accountId: string;
  descricaoInicial: string;
  currency: CurrencyCode;
  sugestao: Sugestao;
  sugestaoCat: string | null;
  categorias: Categoria[];
  contas: Conta[];
}) {
  const [aba, setAba] = useState<"lancamento" | "transferencia">("lancamento");

  return (
    <div className="space-y-3">
      {/* Par sugerido pelo casamento automático */}
      {sugestao && (
        <form action={conciliarLinha} className="space-y-2 rounded-lg border border-income/25 bg-income-subtle/40 p-3">
          <input type="hidden" name="linhaId" value={linhaId} />
          <input type="hidden" name="transactionIds" value={sugestao.ids.join(",")} />
          <input type="hidden" name="accountId" value={accountId} />
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              sugestao.confianca === "alta" ? "bg-income-subtle text-income" : "bg-xp-subtle text-warning",
            )}
          >
            <Sparkles className="size-3" />
            {sugestao.racha ? "Racha (2 lançamentos)" : sugestao.confianca === "alta" ? "Par encontrado" : "Par provável"}
          </span>
          <div>
            <p className="text-sm font-medium">{sugestao.description}</p>
            <p className="text-xs text-muted-foreground">
              {d(sugestao.date)} · {formatMoney(Math.abs(sugestao.amount), currency)}
            </p>
          </div>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            <Check className="size-3.5" />
            Conciliar
          </button>
        </form>
      )}

      {/* Abas: novo lançamento / nova transferência */}
      <div className="flex gap-1 rounded-lg bg-surface-muted p-0.5">
        <button
          type="button"
          onClick={() => setAba("lancamento")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            aba === "lancamento" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Receipt className="size-3.5" />
          Novo lançamento
        </button>
        <button
          type="button"
          onClick={() => setAba("transferencia")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            aba === "transferencia" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeftRight className="size-3.5" />
          Nova transferência
        </button>
      </div>

      {aba === "lancamento" ? (
        <form action={criarEConciliar} className="space-y-3">
          <input type="hidden" name="linhaId" value={linhaId} />
          <input type="hidden" name="accountId" value={accountId} />
          <label className="block text-xs font-medium text-muted-foreground">
            Descrição
            <input
              name="descricao"
              defaultValue={descricaoInicial}
              required
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Categoria
            <select
              name="categoryId"
              defaultValue={sugestaoCat ?? ""}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {sugestaoCat && <p className="text-[11px] text-primary-text">Categoria sugerida pelas suas regras.</p>}
          <button type="submit" className={buttonClasses("primary", "sm")}>
            <Check className="size-3.5" />
            Criar e conciliar
          </button>
        </form>
      ) : (
        <form action={criarTransferenciaEConciliar} className="space-y-3">
          <input type="hidden" name="linhaId" value={linhaId} />
          <input type="hidden" name="accountId" value={accountId} />
          <p className="text-[11px] text-muted-foreground">
            O dinheiro deste movimento foi/para outra conta sua (aplicação, saque, pagamento de fatura).
          </p>
          <label className="block text-xs font-medium text-muted-foreground">
            Descrição
            <input
              name="descricao"
              defaultValue={descricaoInicial}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Conta de destino
            <select
              name="contaDestinoId"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              <option value="" disabled>
                Escolha a conta…
              </option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={contas.length === 0} className={buttonClasses("primary", "sm")}>
            <Check className="size-3.5" />
            Criar transferência e conciliar
          </button>
        </form>
      )}
    </div>
  );
}
