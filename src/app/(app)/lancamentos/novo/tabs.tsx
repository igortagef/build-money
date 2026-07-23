"use client";

import { useState } from "react";
import { ArrowLeftRight, CreditCard, HandCoins, Pencil } from "lucide-react";
import { cn } from "@/components/ui";
import { NewTransactionForm } from "./form";
import { TransferForm } from "../../transferencias/nova/form";
import { NewRachaForm } from "../../rachas/novo/form";
import { NewInstallmentForm } from "../parcelado/form";
import type { CurrencyCode } from "@/db/schema";

type Conta = {
  id: string;
  name: string;
  currency: CurrencyCode;
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};
type Categoria = { id: string; label: string; type: "income" | "expense" };

type Aba = "lancamento" | "transferencia" | "parcelada" | "racha";

const ABAS: { id: Aba; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "lancamento", label: "Lançamento", Icon: Pencil },
  { id: "transferencia", label: "Transferência", Icon: ArrowLeftRight },
  { id: "parcelada", label: "Parcelada", Icon: CreditCard },
  { id: "racha", label: "Racha", Icon: HandCoins },
];

/**
 * Abas do novo lançamento: receita/despesa, transferência e racha num só
 * lugar. Todos são formas de registrar movimento de dinheiro; reuni-las evita
 * o usuário ter que adivinhar em qual tela cada uma vive.
 */
export function LancamentoTabs({
  abaInicial,
  contas,
  categorias,
  categoriasDespesa,
  baseCurrency,
  hoje,
}: {
  abaInicial?: string;
  contas: Conta[];
  categorias: Categoria[];
  categoriasDespesa: { id: string; label: string }[];
  baseCurrency: CurrencyCode;
  hoje: string;
}) {
  const inicial: Aba =
    abaInicial === "transferencia" ||
    abaInicial === "parcelada" ||
    abaInicial === "racha"
      ? abaInicial
      : "lancamento";
  const [aba, setAba] = useState<Aba>(inicial);

  // Transferência e racha precisam de pelo menos duas contas (uma envolve a
  // piscina de rachas, criada sob demanda; a transferência precisa de origem
  // e destino distintos).
  const poucasContas = contas.length < 2;

  return (
    <div className="space-y-5">
      <div
        className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1 sm:grid-cols-4"
        role="tablist"
        aria-label="Tipo de registro"
      >
        {ABAS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors",
              aba === id
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {aba === "lancamento" && (
        <NewTransactionForm
          contas={contas}
          categorias={categorias}
          baseCurrency={baseCurrency}
          hoje={hoje}
        />
      )}

      {aba === "transferencia" &&
        (poucasContas ? (
          <AvisoContas texto="A transferência precisa de pelo menos duas contas." />
        ) : (
          <TransferForm contas={contas} hoje={hoje} />
        ))}

      {aba === "parcelada" && (
        <NewInstallmentForm contas={contas} categorias={categoriasDespesa} hoje={hoje} />
      )}

      {aba === "racha" &&
        (contas.length === 0 ? (
          <AvisoContas texto="Cadastre uma conta para registrar um racha." />
        ) : (
          <NewRachaForm contas={contas} categorias={categoriasDespesa} hoje={hoje} />
        ))}
    </div>
  );
}

function AvisoContas({ texto }: { texto: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}
