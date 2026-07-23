import { CheckCircle2, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { CardPainel } from "./card-painel";
import { cn } from "./ui";
import { formatMoney } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";
import type { VariacaoCategoria } from "@/lib/painel-extras";

/** Lançamentos realizados que ainda não bateram com o extrato. */
export function AConferirCard({
  dados,
  currency,
}: {
  dados: { qtd: number; total: number; contaId: string | null; contaNome: string | null };
  currency: CurrencyCode;
}) {
  const tudoOk = dados.qtd === 0;
  return (
    <CardPainel
      titulo="A conferir"
      Icon={CheckCircle2}
      acao={{ label: "Ver a conferir", href: "/lancamentos?status=conferir" }}
      href="/lancamentos?status=conferir"
      corpoClassName="p-5"
    >
      {tudoOk ? (
        <p className="text-sm text-muted-foreground">
          Tudo conferido com o extrato. 🎉
        </p>
      ) : (
        <>
          <p className="tabular text-2xl font-semibold">{dados.qtd}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {dados.qtd === 1 ? "lançamento aguarda" : "lançamentos aguardam"} conferência
            {dados.total > 0 && ` · ${formatMoney(dados.total, currency)} em despesas`}
          </p>
          {dados.contaNome && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Maior volume em <span className="font-medium text-foreground">{dados.contaNome}</span>
            </p>
          )}
        </>
      )}
    </CardPainel>
  );
}

/** Variação de gastos por categoria contra o mês anterior. */
export function ComparativoCard({
  dados,
  currency,
}: {
  dados: VariacaoCategoria[];
  currency: CurrencyCode;
}) {
  return (
    <CardPainel titulo="Comparativo com o mês anterior" Icon={Scale} corpoClassName="p-5">
      {dados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sem histórico suficiente para comparar ainda.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {dados.map((d) => {
            const subiu = d.variacao > 0;
            return (
              <li key={d.nome} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{d.nome}</span>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-xs font-semibold",
                    subiu ? "text-expense" : "text-income",
                  )}
                >
                  {subiu ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {d.percentual !== null ? `${Math.abs(d.percentual)}%` : "novo"}
                  <span className="tabular ml-1 font-normal text-muted-foreground">
                    {formatMoney(Math.abs(d.variacao), currency)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Comparado ao mesmo período do mês anterior.
      </p>
    </CardPainel>
  );
}
