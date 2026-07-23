import Link from "next/link";
import { ListChecks, Check, AlertCircle, FileUp } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getResumoConciliacao } from "@/lib/conciliacao";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { BankIcon } from "@/components/bank-icon";

export const metadata = { title: "Conciliação · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dataDe = (iso: string) => DATA.format(new Date(`${iso}T12:00:00`));

export default async function ConciliacaoPage() {
  const { ledgerId } = await requireAccess();
  const contas = await getResumoConciliacao(ledgerId);

  const totalPendente = contas.reduce((s, c) => s + c.aConferir, 0);
  const contasAtrasadas = contas.filter((c) => !c.emDia).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ListChecks className="size-6 text-primary-text" />
          Conciliação
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confira o que está no app contra o extrato do banco — conta por conta, dia a dia.
        </p>
      </div>

      {/* Resposta imediata: estou em dia? */}
      <Card
        className={cn(
          "flex items-center gap-3 p-5",
          totalPendente === 0 && contas.length > 0 && "border-income-subtle bg-income-subtle",
        )}
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            totalPendente === 0 ? "bg-income-subtle text-income" : "bg-xp-subtle text-warning",
          )}
        >
          {totalPendente === 0 ? <Check className="size-5" /> : <AlertCircle className="size-5" />}
        </span>
        <div>
          <p className="font-semibold">
            {contas.length === 0
              ? "Nenhuma conta cadastrada"
              : totalPendente === 0
                ? "Tudo conferido"
                : `${totalPendente} ${totalPendente === 1 ? "lançamento" : "lançamentos"} a conferir`}
          </p>
          <p className="text-xs text-muted-foreground">
            {contas.length === 0
              ? "As contas são cadastradas em Cadastros › Contas."
              : contasAtrasadas === 0
                ? "Todas as contas estão em dia com o extrato."
                : `${contasAtrasadas} ${contasAtrasadas === 1 ? "conta precisa" : "contas precisam"} de atenção.`}
          </p>
        </div>
      </Card>

      {contas.length > 0 && (
        <div className="space-y-3">
          {contas.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-center gap-3">
                <BankIcon bankId={c.bankId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.conferidoAte
                      ? `Conferido até ${dataDe(c.conferidoAte)} · ${formatMoney(c.saldoConferido, c.currency)}`
                      : "Nada conferido ainda"}
                  </p>
                </div>
                <Link href={`/conciliacao/${c.id}`} className={buttonClasses(c.emDia ? "secondary" : "primary", "sm")}>
                  {c.emDia ? "Revisar" : "Conciliar"}
                </Link>
              </div>

              {/* Progresso do que falta bater com o extrato */}
              {!c.emDia && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-xp-subtle px-2 py-0.5 font-medium text-warning">
                    {c.aConferir} a conferir
                  </span>
                  <span className="text-muted-foreground">
                    {formatMoney(c.valorAConferir, c.currency)} em movimentos
                  </span>
                </div>
              )}

              {c.linhasPendentes > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary-text">
                  <FileUp className="size-3.5" />
                  {c.linhasPendentes} {c.linhasPendentes === 1 ? "linha do extrato aguardando" : "linhas do extrato aguardando"}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
