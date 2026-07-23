import Link from "next/link";
import { CreditCard, ChevronRight, CalendarClock, Plus } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getCartoes } from "@/lib/faturas";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";

export const metadata = { title: "Cartões · Build Money" };

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dataDe = (iso: string) => DATA_CURTA.format(new Date(`${iso}T12:00:00`));

export default async function CartoesPage() {
  const { ledgerId } = await requireAccess();
  const cartoes = await getCartoes(ledgerId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Cartões</h1>
        <Link href="/contas/nova" className={buttonClasses("secondary", "sm")}>
          <Plus className="size-4" />
          Novo cartão
        </Link>
      </div>

      {cartoes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary-text">
            <CreditCard className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            Nenhum cartão de crédito cadastrado. Crie uma conta do tipo cartão para
            acompanhar as faturas aqui.
          </p>
          <Link href="/contas/nova" className={buttonClasses("primary", "sm")}>
            <Plus className="size-4" />
            Cadastrar cartão
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {cartoes.map((c) => (
            <Link
              key={c.id}
              href={`/cartoes/${c.id}`}
              className="group block"
              aria-label={`Faturas de ${c.name}`}
            >
              <Card className="p-5 transition-colors group-hover:border-border-strong">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text"
                    aria-hidden
                  >
                    <CreditCard className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.institution ?? "Cartão de crédito"}
                      {c.statementClosingDay && c.paymentDueDay
                        ? ` · fecha dia ${c.statementClosingDay}, vence dia ${c.paymentDueDay}`
                        : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-surface-muted p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">Fatura aberta</p>
                    <p className="tabular mt-0.5 text-lg font-semibold">
                      {formatMoney(c.faturaAberta?.total ?? 0, c.currency)}
                    </p>
                    {c.faturaAberta && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarClock className="size-3" />
                        fecha {dataDe(c.faturaAberta.closingDate)} · vence {dataDe(c.faturaAberta.dueDate)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-surface-muted p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">Saldo devedor</p>
                    <p
                      className={cn(
                        "tabular mt-0.5 text-lg font-semibold",
                        c.balance < 0 && "text-expense",
                      )}
                    >
                      {formatMoney(Math.abs(Math.min(0, c.balance)), c.currency)}
                    </p>
                    {c.usage !== null && (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              c.usage > 80 ? "bg-expense" : "bg-primary",
                            )}
                            style={{ width: `${c.usage}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {c.usage}% do limite de {formatMoney(c.creditLimit ?? 0, c.currency)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          <p className="px-1 text-center text-xs text-muted-foreground">
            Toque num cartão para ver todas as faturas e movimentações rastreáveis.
          </p>
        </div>
      )}
    </div>
  );
}
