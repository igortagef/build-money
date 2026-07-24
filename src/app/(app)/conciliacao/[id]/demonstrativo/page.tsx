import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Link2, AlertTriangle, ScrollText } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getDemonstrativo, type NivelMovimento } from "@/lib/demonstrativo";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { informarSaldoDia } from "../../actions";

export const metadata = { title: "Demonstrativo de conciliação · Build Money" };

const MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const d = (iso: string) => DIA.format(new Date(`${iso}T12:00:00`));

const NIVEL: Record<NivelMovimento, { label: string; cls: string; Icon: typeof Link2 }> = {
  vinculo: { label: "vínculo", cls: "bg-income-subtle text-income", Icon: Link2 },
  saldo: { label: "por saldo", cls: "bg-primary-subtle text-primary-text", Icon: Check },
  pendente: { label: "pendente", cls: "bg-xp-subtle text-warning", Icon: AlertTriangle },
};

export default async function DemonstrativoPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await props.params;
  const { mes } = await props.searchParams;
  const { ledgerId } = await requireAccess();

  const referencia = mes ? new Date(`${mes}-01T12:00:00`) : new Date();
  const dados = await getDemonstrativo(ledgerId, id, referencia);
  if (!dados) notFound();

  const { conta, dias } = dados;
  const isoMes = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  const anterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  const proximo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);
  const rotulo = MES.format(referencia);
  const titulo = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/conciliacao/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {conta.name}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ScrollText className="size-6 text-primary-text" />
          Demonstrativo de conciliação
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dia a dia: saldo do sistema × saldo do banco, e o nível de conferência de cada
          movimento.
        </p>
      </div>

      {/* Resumo do mês */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <p className="text-sm text-muted-foreground">Movimentos</p>
          <p className="tabular text-xl font-semibold">{dados.totalMov}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Com vínculo</p>
          <p className="tabular text-xl font-semibold text-income">{dados.totalVinculo}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Sem vínculo</p>
          <p className={cn("tabular text-xl font-semibold", dados.semVinculo > 0 ? "text-warning" : "")}>
            {dados.semVinculo}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Dias que não fecham</p>
          <p className={cn("tabular text-xl font-semibold", dados.diasNaoFecham > 0 ? "text-expense" : "")}>
            {dados.diasNaoFecham}
          </p>
        </div>
      </Card>

      {/* Navegação de mês */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/conciliacao/${id}/demonstrativo?mes=${isoMes(anterior)}`} className={buttonClasses("secondary", "sm")}>
          ‹ Anterior
        </Link>
        <span className="min-w-40 text-center text-sm font-medium">{titulo}</span>
        <Link href={`/conciliacao/${id}/demonstrativo?mes=${isoMes(proximo)}`} className={buttonClasses("secondary", "sm")}>
          Próximo ›
        </Link>
      </div>

      {dias.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum movimento realizado em {titulo.toLowerCase()}.
        </Card>
      ) : (
        <div className="space-y-3">
          {dias.map((dia) => (
            <Card key={dia.data} className="overflow-hidden p-0">
              {/* Cabeçalho do dia: sistema × banco × diferença */}
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 border-b border-border p-4",
                  dia.saldoBanco !== null && (dia.fecha ? "bg-income-subtle/40" : "bg-expense-subtle/30"),
                )}
              >
                <p className="text-sm font-semibold">{d(dia.data)}</p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-right text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Sistema</p>
                    <p className="tabular font-semibold">{formatMoney(dia.saldoSistema, conta.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Banco</p>
                    <p className="tabular font-semibold">
                      {dia.saldoBanco !== null ? formatMoney(dia.saldoBanco, conta.currency) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Diferença</p>
                    {dia.diferenca === null ? (
                      <p className="text-muted-foreground/70">sem saldo</p>
                    ) : dia.diferenca === 0 ? (
                      <p className="flex items-center gap-1 font-semibold text-income">
                        <Check className="size-4" /> fecha
                      </p>
                    ) : (
                      <p className="tabular font-semibold text-expense">
                        {dia.diferenca > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(dia.diferenca), conta.currency)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Movimentos do dia com o nível de conferência */}
              <div className="divide-y divide-border">
                {dia.movimentos.map((m) => {
                  const n = NIVEL[m.nivel];
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", n.cls)}>
                        <n.Icon className="size-3" />
                        {n.label}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm">{m.description}</p>
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
                    </div>
                  );
                })}
              </div>

              {/* Informar o saldo do banco deste dia */}
              <form action={informarSaldoDia} className="flex flex-wrap items-center gap-2 bg-surface-muted/40 p-3">
                <input type="hidden" name="accountId" value={id} />
                <input type="hidden" name="data" value={dia.data} />
                <span className="text-xs text-muted-foreground">Saldo do banco neste dia:</span>
                <input
                  name="saldo"
                  inputMode="decimal"
                  placeholder="1.234,56"
                  defaultValue={dia.saldoBanco !== null ? (dia.saldoBanco / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}
                  className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm tabular text-foreground"
                />
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  Informar
                </button>
                {dia.semVinculo > 0 && (
                  <span className="ml-auto text-xs text-warning">
                    {dia.semVinculo} sem vínculo com o extrato
                  </span>
                )}
              </form>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
