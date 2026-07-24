import Link from "next/link";
import { ArrowLeftRight, CreditCard, Banknote, Landmark, PiggyBank, Plus, TrendingUp, ListChecks, Pencil } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getAccountsWithBalance } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { BankIcon } from "@/components/bank-icon";
import type { AccountType } from "@/db/schema";

export const metadata = { title: "Contas · Build Money" };

const TYPE_META: Record<
  AccountType,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  checking: { label: "Conta corrente", Icon: Landmark },
  savings: { label: "Poupança", Icon: PiggyBank },
  credit_card: { label: "Cartão de crédito", Icon: CreditCard },
  cash: { label: "Espécie", Icon: Banknote },
  investment: { label: "Investimentos", Icon: TrendingUp },
};

export default async function ContasPage() {
  const { ledgerId } = await requireAccess();
  const accounts = await getAccountsWithBalance(ledgerId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro das suas contas e cartões — saldo de hoje e limites.
          </p>
        </div>
        <Link href="/contas/nova" className={buttonClasses()}>
          <Plus className="size-4" />
          Nova conta
        </Link>
      </div>

      {/* Cada tela tem um papel; aqui é só o cadastro. */}
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Procurando outra coisa?</span>
        <Link href="/conciliacao" className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline">
          <ListChecks className="size-3.5" />
          Conferir com o extrato do banco
        </Link>
        <Link href="/cartoes" className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline">
          <CreditCard className="size-3.5" />
          Faturas do cartão
        </Link>
        <Link href="/lancamentos" className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline">
          <ArrowLeftRight className="size-3.5" />
          Movimentações
        </Link>
      </Card>

      {accounts.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma conta cadastrada ainda.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const meta = TYPE_META[account.type];
            const usage =
              account.type === "credit_card" && account.creditLimit
                ? Math.min(
                    100,
                    Math.round((Math.abs(account.balance) / account.creditLimit) * 100),
                  )
                : null;

            return (
              <Card key={account.id} className="p-4">
                <div className="flex items-center gap-3">
                  {/* Banco escolhido -> ícone na cor da marca; senão, o ícone do
                      tipo de conta. */}
                  {account.icon ? (
                    <BankIcon bankId={account.icon} />
                  ) : (
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text"
                      aria-hidden
                    >
                      <meta.Icon className="size-4" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{account.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {meta.label}
                      {account.institution && ` · ${account.institution}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={cn(
                        "tabular font-semibold",
                        account.balance < 0 && "text-expense",
                      )}
                    >
                      {formatMoney(account.balance, account.currency)}
                    </p>
                    {usage !== null && (
                      <p className="text-xs text-muted-foreground">
                        {usage}% do limite
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/contas/${account.id}/editar`}
                    aria-label={`Editar conta ${account.name}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Link>
                </div>

                {usage !== null && (
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                    role="progressbar"
                    aria-valuenow={usage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uso do limite de ${account.name}`}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        usage > 80 ? "bg-expense" : "bg-primary",
                      )}
                      style={{ width: `${usage}%` }}
                    />
                  </div>
                )}

              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
