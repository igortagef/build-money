import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CircleDashed, AlertCircle, FileUp, Landmark, ScrollText } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getConciliacaoConta } from "@/lib/conciliacao-conta";
import { getUltimaConferenciaSaldo } from "@/lib/saldo-banco";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { BankIcon } from "@/components/bank-icon";
import { ReconcileButton } from "../../lancamentos/reconcile-button";
import { conferirDia, desconferirDia } from "../actions";
import { SaldoBancoForm } from "./saldo-banco-form";

export const metadata = { title: "Conciliação da conta · Build Money" };

const MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const d = (iso: string) => DIA.format(new Date(`${iso}T12:00:00`));
const semana = (iso: string) => SEMANA.format(new Date(`${iso}T12:00:00`));

export default async function ConciliacaoContaPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await props.params;
  const { mes } = await props.searchParams;
  const { ledgerId } = await requireAccess();

  const referencia = mes ? new Date(`${mes}-01T12:00:00`) : new Date();
  const dados = await getConciliacaoConta(ledgerId, id, referencia);
  if (!dados) notFound();

  const { conta, dias } = dados;
  const saldoBanco = await getUltimaConferenciaSaldo(ledgerId, id);
  const hoje = new Date().toISOString().slice(0, 10);
  const isoMes = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  const anterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  const proximo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);
  const rotulo = MES.format(referencia);
  const titulo = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/conciliacao"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Conciliação
        </Link>
        <div className="flex items-center gap-3">
          <BankIcon bankId={conta.icon} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{conta.name}</h1>
            <p className="text-sm text-muted-foreground">
              Compare o saldo de cada dia com o extrato e confirme.
            </p>
          </div>
        </div>
      </div>

      {/* A linha de corte: o número que você compara com o extrato. */}
      <Card
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 p-5",
          dados.totalAConferir === 0 && "border-income-subtle bg-income-subtle",
        )}
      >
        <div>
          <p className="text-xs font-medium text-muted-foreground">Conferido até</p>
          <p className="text-lg font-semibold">
            {dados.conferidoAte ? d(dados.conferidoAte) : "nada ainda"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground">Saldo conferido</p>
          <p className="tabular text-lg font-semibold text-income">
            {formatMoney(dados.saldoFinalConferido, conta.currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground">Saldo lançado</p>
          <p className="tabular text-lg font-semibold">
            {formatMoney(dados.saldoFinalLancado, conta.currency)}
          </p>
        </div>
      </Card>

      {/* Saldo do banco: o número de fora, comparado ao que o app calcula. */}
      <Card
        className={cn(
          "space-y-3 p-5",
          saldoBanco && saldoBanco.diferenca === 0 && "border-income-subtle bg-income-subtle",
        )}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Landmark className="size-4 text-primary-text" />
          Saldo do banco
        </h2>

        {saldoBanco ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Extrato em {d(saldoBanco.date)}</p>
              <p className="tabular text-lg font-semibold">
                {formatMoney(saldoBanco.balance, conta.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">App na mesma data</p>
              <p className="tabular text-lg font-semibold">
                {formatMoney(saldoBanco.saldoApp, conta.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferença</p>
              {saldoBanco.diferenca === 0 ? (
                <p className="flex items-center gap-1 text-lg font-semibold text-income">
                  <Check className="size-4" /> bate certo
                </p>
              ) : (
                <p className="tabular text-lg font-semibold text-warning">
                  {saldoBanco.diferenca > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(saldoBanco.diferenca), conta.currency)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Informe o saldo que o extrato mostra numa data para comparar com o app.
          </p>
        )}

        {saldoBanco && saldoBanco.diferenca !== 0 && (
          <p className="text-xs text-muted-foreground">
            {saldoBanco.diferenca > 0
              ? "O app tem mais do que o banco: pode haver lançamento a mais, ou uma saída ainda não registrada."
              : "O banco tem mais do que o app: pode faltar registrar uma entrada, ou há um lançamento a menos."}
          </p>
        )}

        <SaldoBancoForm accountId={id} dataPadrao={dados.conferidoAte ?? hoje} />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/conciliacao/${id}/extrato`} className={buttonClasses("primary", "sm")}>
          <FileUp className="size-4" />
          Conciliar com o extrato (OFX)
        </Link>
        <Link href={`/conciliacao/${id}/demonstrativo`} className={buttonClasses("secondary", "sm")}>
          <ScrollText className="size-4" />
          Demonstrativo diário
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/conciliacao/${id}?mes=${isoMes(anterior)}`} className={buttonClasses("secondary", "sm")}>
          ‹ Anterior
        </Link>
        <span className="min-w-40 text-center text-sm font-medium">{titulo}</span>
        <Link href={`/conciliacao/${id}?mes=${isoMes(proximo)}`} className={buttonClasses("secondary", "sm")}>
          Próximo ›
        </Link>
      </div>

      {dias.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento realizado em {titulo.toLowerCase()}.
        </Card>
      ) : (
        <div className="space-y-3">
          {dias.map((dia) => (
            <Card key={dia.data} className="overflow-hidden p-0">
              {/* Dia fechado abre recolhido: o olho vai direto ao que falta. */}
              <details open={!dia.fechado}>
                <summary
                  className={cn(
                    "flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 hover:bg-surface-muted",
                    dia.fechado && "opacity-80",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      dia.fechado
                        ? "bg-income-subtle text-income"
                        : dia.saldoConferido === dia.saldoLancado
                          ? "bg-surface-muted text-muted-foreground"
                          : "bg-xp-subtle text-warning",
                    )}
                  >
                    {dia.fechado ? <Check className="size-4" /> : dia.aConferir === dia.movimentos.length ? <CircleDashed className="size-4" /> : <AlertCircle className="size-4" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {d(dia.data)} <span className="font-normal text-muted-foreground">· {semana(dia.data)}</span>
                    </p>
                    {!dia.fechado && (
                      <p className="text-xs text-muted-foreground">
                        {dia.aConferir} de {dia.movimentos.length} a conferir
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="tabular text-sm font-semibold">
                      {formatMoney(dia.saldoLancado, conta.currency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {dia.fechado ? (
                        "conferido"
                      ) : (
                        <>
                          conferido {formatMoney(dia.saldoConferido, conta.currency)}
                          {dia.diferenca !== 0 && (
                            <span className="ml-1 font-semibold text-warning">
                              ({dia.diferenca > 0 ? "−" : "+"}
                              {formatMoney(Math.abs(dia.diferenca), conta.currency)})
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </summary>

                <div className="divide-y divide-border border-t border-border">
                  {dia.movimentos.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.description}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.categorias.length > 0 ? m.categorias.join(", ") : "Sem categoria"}
                          {m.status === "reconciled" && " · conferido"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "tabular shrink-0 text-sm font-semibold",
                          m.type === "income" && "text-income",
                          m.type === "expense" && "text-expense",
                          m.type === "transfer" && "text-muted-foreground",
                        )}
                      >
                        {m.assinado < 0 ? "−" : "+"} {formatMoney(Math.abs(m.amount), conta.currency)}
                      </span>
                      <ReconcileButton
                        id={m.id}
                        descricao={m.description}
                        conciliado={m.status === "reconciled"}
                        previsto={false}
                      />
                    </div>
                  ))}

                  <div className="flex justify-end gap-2 bg-surface-muted/40 p-3">
                    {dia.fechado ? (
                      <form action={desconferirDia}>
                        <input type="hidden" name="accountId" value={id} />
                        <input type="hidden" name="data" value={dia.data} />
                        <button type="submit" className={buttonClasses("ghost", "sm")}>
                          Desfazer conferência do dia
                        </button>
                      </form>
                    ) : (
                      <form action={conferirDia}>
                        <input type="hidden" name="accountId" value={id} />
                        <input type="hidden" name="data" value={dia.data} />
                        <button type="submit" className={buttonClasses("primary", "sm")}>
                          <Check className="size-3.5" />
                          Conferir o dia inteiro
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
