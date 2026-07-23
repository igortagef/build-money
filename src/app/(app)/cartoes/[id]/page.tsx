import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, Repeat, RefreshCcw } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getFaturasDoCartao } from "@/lib/faturas";
import type { Fatura, StatusFatura } from "@/lib/faturas";
import { formatMoney } from "@/lib/money";
import { Card, cn } from "@/components/ui";
import type { CurrencyCode } from "@/db/schema";
import { rotuloParcela } from "@/lib/installments";
import { FaturaAcoes } from "./fatura-acoes";

export const metadata = { title: "Faturas do cartão · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const DATA_ANO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const d = (iso: string) => DATA.format(new Date(`${iso}T12:00:00`));
const dAno = (iso: string) => DATA_ANO.format(new Date(`${iso}T12:00:00`));

const STATUS_META: Record<StatusFatura, { label: string; cls: string }> = {
  open: { label: "Aberta", cls: "bg-primary-subtle text-primary-text" },
  closed: { label: "Fechada", cls: "bg-xp-subtle text-warning" },
  paid: { label: "Paga", cls: "bg-income-subtle text-income" },
  reparcelada: { label: "Reparcelada", cls: "bg-surface-muted text-muted-foreground" },
};

export default async function CartaoFaturasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { ledgerId } = await requireAccess();
  const { conta, faturas } = await getFaturasDoCartao(ledgerId, id);

  if (!conta) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/cartoes"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Cartões
        </Link>
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text"
            aria-hidden
          >
            <CreditCard className="size-4" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{conta.name}</h1>
            <p className="text-sm text-muted-foreground">
              {conta.institution ?? "Cartão de crédito"}
              {conta.statementClosingDay && conta.paymentDueDay
                ? ` · fecha dia ${conta.statementClosingDay}, vence dia ${conta.paymentDueDay}`
                : " · sem fechamento configurado"}
            </p>
          </div>
        </div>
      </div>

      {faturas.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma movimentação neste cartão ainda.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {faturas.map((f) => (
            <FaturaBloco key={f.dueDate} fatura={f} currency={conta.currency} accountId={id} />
          ))}
        </div>
      )}
    </div>
  );
}

function FaturaBloco({
  fatura,
  currency,
  accountId,
}: {
  fatura: Fatura;
  currency: CurrencyCode;
  accountId: string;
}) {
  const meta = STATUS_META[fatura.status];
  // Aberta e fechada-a-pagar abrem por padrão; histórico fica recolhido.
  const abertoPorPadrao = fatura.status === "open" || fatura.status === "closed";
  // Há parcelas previstas (em aberto) que podem ser reparceladas?
  const temAberto = fatura.movimentos.some(
    (m) => m.status === "pending" && !m.reparcelada && m.type === "expense",
  );

  return (
    <Card className="overflow-hidden">
      <details open={abertoPorPadrao}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-surface-muted">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Vencimento {dAno(fatura.dueDate)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.cls)}>
                {meta.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Período {d(fatura.periodo.inicio)} – {d(fatura.periodo.fim)} · {fatura.qtdMovimentos}{" "}
              {fatura.qtdMovimentos === 1 ? "movimento" : "movimentos"}
            </p>
          </div>
          <span
            className={cn(
              "tabular shrink-0 text-lg font-semibold",
              fatura.total > 0 ? "text-expense" : "text-foreground",
            )}
          >
            {formatMoney(fatura.total, currency)}
          </span>
        </summary>

        <div className="divide-y divide-border border-t border-border">
          {fatura.movimentos.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                m.reparcelada && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span className="truncate">{m.description}</span>
                  {m.installmentNumber && m.installmentTotal && (
                    <span className="shrink-0 rounded-full bg-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold text-primary-text">
                      {rotuloParcela(m.installmentNumber, m.installmentTotal)}
                    </span>
                  )}
                  {m.ehReparcelamento && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      title={m.origemVencimento ? `Reparcelamento da fatura de ${dAno(m.origemVencimento)}` : "Reparcelamento"}
                    >
                      <RefreshCcw className="size-2.5" />
                      reparcelamento
                    </span>
                  )}
                  {m.reparcelada && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Repeat className="size-2.5" />
                      reparcelada
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {d(m.date)}
                  {m.categorias.length > 0 && ` · ${m.categorias.join(", ")}`}
                  {m.status === "pending" && " · prevista"}
                  {m.status === "reconciled" && " · conferida"}
                  {m.ehReparcelamento && m.origemVencimento && ` · origem: fatura ${dAno(m.origemVencimento)}`}
                </p>
              </div>
              <span
                className={cn(
                  "tabular shrink-0 text-sm font-semibold",
                  m.type === "income" ? "text-income" : "text-expense",
                  m.reparcelada && "line-through",
                )}
              >
                {m.type === "income" ? "+" : "−"} {formatMoney(m.amount, currency)}
              </span>
            </div>
          ))}
        </div>

        <FaturaAcoes
          accountId={accountId}
          dueDate={fatura.dueDate}
          statementId={fatura.statementId}
          status={fatura.status}
          persistida={fatura.persistida}
          temAberto={temAberto}
        />
      </details>
    </Card>
  );
}
