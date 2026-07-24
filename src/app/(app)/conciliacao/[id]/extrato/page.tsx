import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Archive, Check, Sparkles } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { getLinhasPendentes } from "@/lib/conciliacao-ofx";
import { getCategoriasParaRegra, getRegrasParaCasar, casarPorRegras } from "@/lib/category-rules";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { ImportarExtratoForm } from "../importar-form";
import { conciliarLinha, arquivarLinha, criarEConciliar } from "../../ofx-actions";

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

  const [linhas, categorias, regras] = await Promise.all([
    getLinhasPendentes(ledgerId, id),
    getCategoriasParaRegra(ledgerId),
    getRegrasParaCasar(ledgerId),
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
          À esquerda, o que veio do banco. À direita, o lançamento do app — ou a criação dele.
        </p>
      </div>

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
                    {l.sugestao ? (
                      <form action={conciliarLinha} className="space-y-3">
                        <input type="hidden" name="linhaId" value={l.id} />
                        <input type="hidden" name="transactionIds" value={l.sugestao.ids.join(",")} />
                        <input type="hidden" name="accountId" value={id} />
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              l.sugestao.confianca === "alta"
                                ? "bg-income-subtle text-income"
                                : "bg-xp-subtle text-warning",
                            )}
                          >
                            <Sparkles className="size-3" />
                            {l.sugestao.racha
                              ? "Racha (2 lançamentos)"
                              : l.sugestao.confianca === "alta"
                                ? "Par encontrado"
                                : "Par provável"}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{l.sugestao.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {d(l.sugestao.date)} · {formatMoney(Math.abs(l.sugestao.amount), conta.currency)}
                          </p>
                          {l.sugestao.racha && (
                            <p className="mt-1 text-[11px] text-primary-text">
                              As duas pernas do racha somam o valor desta linha e serão conferidas juntas.
                            </p>
                          )}
                        </div>
                        <button type="submit" className={buttonClasses("primary", "sm")}>
                          <Check className="size-3.5" />
                          Conciliar
                        </button>
                      </form>
                    ) : (
                      <form action={criarEConciliar} className="space-y-3">
                        <input type="hidden" name="linhaId" value={l.id} />
                        <input type="hidden" name="accountId" value={id} />
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Sem par — criar lançamento
                        </p>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Descrição
                          <input
                            name="descricao"
                            defaultValue={l.description}
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
                            {catsDaLinha.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {sugestaoCat && (
                          <p className="text-[11px] text-primary-text">
                            Categoria sugerida pelas suas regras.
                          </p>
                        )}
                        <button type="submit" className={buttonClasses("primary", "sm")}>
                          <Check className="size-3.5" />
                          Criar e conciliar
                        </button>
                      </form>
                    )}
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
