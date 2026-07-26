import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Archive } from "lucide-react";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { getLinhasPendentes, getCandidatosParaBusca, getContagemLinhas } from "@/lib/conciliacao-ofx";
import { getCategoriasParaRegra, getRegrasParaCasar, casarPorRegras } from "@/lib/category-rules";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { ImportarExtratoForm } from "../importar-form";
import { PainelConciliacao } from "../painel";
import { arquivarLinha } from "../../ofx-actions";

export const metadata = { title: "Conciliar extrato · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const SEM = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const d = (iso: string) => DATA.format(new Date(`${iso}T12:00:00`));
const sem = (iso: string) => SEM.format(new Date(`${iso}T12:00:00`));

export default async function ConciliarExtratoPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { ledgerId } = await requireAccess();

  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) notFound();

  const [linhas, categorias, regras, candidatos, contagem, contasDestino] = await Promise.all([
    getLinhasPendentes(ledgerId, id),
    getCategoriasParaRegra(ledgerId),
    getRegrasParaCasar(ledgerId),
    getCandidatosParaBusca(ledgerId, id),
    getContagemLinhas(ledgerId, id),
    // Destinos possíveis de uma transferência: as outras contas do espaço
    // (não a atual, não arquivadas, sem as contas-piscina internas).
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.ledgerId, ledgerId),
          ne(accounts.id, id),
          isNull(accounts.archivedAt),
          eq(accounts.isReimbursementPool, false),
          eq(accounts.isInvestmentPool, false),
        ),
      )
      .orderBy(asc(accounts.name)),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href={`/conciliacao/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {conta.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Conciliar com o extrato</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O extrato importado é o espelho: cada linha vira um lançamento no sistema
          (ou é arquivada). À esquerda, o banco; à direita, o app.
        </p>
      </div>

      {/* Espelho: situação das linhas importadas desta conta. */}
      {contagem.pendentes + contagem.conciliadas + contagem.arquivadas > 0 && (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Conciliadas</p>
            <p className="tabular text-lg font-semibold text-income">{contagem.conciliadas}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className={cn("tabular text-lg font-semibold", contagem.pendentes > 0 && "text-warning")}>
              {contagem.pendentes}
            </p>
          </div>
          <Link
            href={`/conciliacao/${id}/arquivados`}
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
          >
            <Archive className="size-4" />
            Arquivadas ({contagem.arquivadas})
          </Link>
        </Card>
      )}

      <Card className="p-5">
        <ImportarExtratoForm accountId={id} />
      </Card>

      {linhas.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma linha aguardando conciliação. Importe um extrato acima.
        </Card>
      ) : (
        <div className="space-y-3">
          {linhas.map((l) => {
            // Sem par: o formulário já vem com a categoria sugerida pelas regras.
            const sugestaoCat = l.sugestao ? null : casarPorRegras(regras, l.description);
            // Entrada (+) mostra só categorias de receita; saída (−) só de despesa.
            const catsDaLinha = categorias.filter((c) =>
              l.amount < 0 ? c.tipo === "expense" : c.tipo === "income",
            );
            return (
              <Card key={l.id} className="overflow-hidden p-0">
                <div className="grid gap-px bg-border md:grid-cols-2">
                  {/* ---------- Banco ---------- */}
                  <div className="bg-surface p-4">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {d(l.date)} <span className="font-normal text-muted-foreground">· {sem(l.date)}</span>
                      </span>
                      <span
                        className={cn(
                          "tabular text-sm font-bold",
                          l.amount < 0 ? "text-expense" : "text-income",
                        )}
                      >
                        {l.amount < 0 ? "−" : "+"} {formatMoney(Math.abs(l.amount), conta.currency)}
                      </span>
                    </div>
                    <p className="break-words text-sm">{l.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Extrato bancário
                      </span>
                      <form action={arquivarLinha}>
                        <input type="hidden" name="linhaId" value={l.id} />
                        <input type="hidden" name="accountId" value={id} />
                        <button type="submit" className={buttonClasses("ghost", "sm")}>
                          <Archive className="size-3.5" />
                          Arquivar
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* ---------- App ---------- */}
                  <div className="bg-surface p-4">
                    <PainelConciliacao
                      linhaId={l.id}
                      accountId={id}
                      descricaoInicial={l.description}
                      valorLinha={l.amount}
                      currency={conta.currency}
                      sugestao={l.sugestao}
                      sugestaoCat={sugestaoCat}
                      categorias={catsDaLinha}
                      contas={contasDestino}
                      candidatos={candidatos}
                      dataLinha={l.date}
                      cartao={
                        conta.type === "credit_card" &&
                        conta.statementClosingDay &&
                        conta.paymentDueDay
                          ? {
                              diaFechamento: conta.statementClosingDay,
                              diaVencimento: conta.paymentDueDay,
                            }
                          : null
                      }
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
