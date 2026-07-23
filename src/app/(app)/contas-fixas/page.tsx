import Link from "next/link";
import { CalendarClock, Plus, Repeat, Zap } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getContasFixas } from "@/lib/provisioning";
import { formatMoney } from "@/lib/money";
import { FREQUENCIA_LABEL } from "@/lib/recurrence";
import { buttonClasses, Card, cn } from "@/components/ui";
import { AcoesFixa } from "./acoes";

export const metadata = { title: "Contas fixas · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

export default async function ContasFixasPage() {
  const { ledgerId, baseCurrency } = await requireAccess();
  const fixas = await getContasFixas(ledgerId);

  const ativas = fixas.filter((f) => f.active);
  const pausadas = fixas.filter((f) => !f.active);

  const totalDespesa = ativas
    .filter((f) => f.type === "expense" && f.frequency === "monthly")
    .reduce((s, f) => s + f.amount, 0);
  const totalReceita = ativas
    .filter((f) => f.type === "income" && f.frequency === "monthly")
    .reduce((s, f) => s + f.amount, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas fixas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre uma vez e o app provisiona os próximos 12 meses.
          </p>
        </div>
        <Link href="/contas-fixas/nova" className={buttonClasses()}>
          <Plus className="size-4" />
          Nova conta fixa
        </Link>
      </div>

      {fixas.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary-text">
            <Repeat className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-semibold">Nada cadastrado ainda</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Aluguel, internet, plano de saúde, salário. O que se repete todo
              mês você cadastra aqui uma vez — e ele passa a aparecer no seu
              fluxo antes de acontecer.
            </p>
          </div>
          <Link href="/contas-fixas/nova" className={buttonClasses("primary", "lg")}>
            <Plus className="size-4" />
            Cadastrar a primeira
          </Link>
        </Card>
      ) : (
        <>
          {/* Só o que é mensal entra no resumo: somar um IPVA anual com o
              aluguel daria um "por mês" que não existe. */}
          {(totalDespesa > 0 || totalReceita > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Receitas fixas do mês
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-income">
                  {formatMoney(totalReceita, baseCurrency)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Despesas fixas do mês
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-expense">
                  {formatMoney(totalDespesa, baseCurrency)}
                </p>
              </Card>
            </div>
          )}

          <section className="space-y-2">
            {ativas.map((f) => (
              <FixaCard key={f.id} fixa={f} />
            ))}
          </section>

          {pausadas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Pausadas
              </h2>
              {pausadas.map((f) => (
                <FixaCard key={f.id} fixa={f} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FixaCard({
  fixa,
}: {
  fixa: Awaited<ReturnType<typeof getContasFixas>>[number];
}) {
  const receita = fixa.type === "income";

  return (
    <Card className={cn("p-4", !fixa.active && "opacity-60")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            receita ? "bg-income-subtle text-income" : "bg-expense-subtle text-expense",
          )}
          aria-hidden
        >
          <Repeat className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {fixa.description}
            {!fixa.active && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (pausada)
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {FREQUENCIA_LABEL[fixa.frequency]}
            {fixa.dayOfMonth && `, dia ${fixa.dayOfMonth}`}
            {" · "}
            {fixa.accountName}
            {fixa.autoConfirm && " · confirma sozinha"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "tabular font-semibold",
              receita ? "text-income" : "text-expense",
            )}
          >
            {receita ? "+" : "−"} {formatMoney(fixa.amount, fixa.currency)}
          </p>
          {fixa.active && fixa.proximo && (
            <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3" aria-hidden />
              {DATA.format(new Date(`${fixa.proximo}T12:00:00`))}
            </p>
          )}
        </div>

        <AcoesFixa
          id={fixa.id}
          descricao={fixa.description}
          ativa={fixa.active}
        />
      </div>

      {fixa.autoConfirm && fixa.active && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Zap className="size-3 shrink-0" aria-hidden />
          Vira realizado sozinho no vencimento — use para débito automático.
        </p>
      )}
    </Card>
  );
}
