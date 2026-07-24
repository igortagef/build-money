import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Archive, RotateCcw } from "lucide-react";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { getLinhasArquivadas } from "@/lib/conciliacao-ofx";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { desarquivarLinha } from "../../ofx-actions";

export const metadata = { title: "Linhas arquivadas · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const d = (iso: string) => DATA.format(new Date(`${iso}T12:00:00`));

export default async function ArquivadasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { ledgerId } = await requireAccess();

  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) notFound();

  const linhas = await getLinhasArquivadas(ledgerId, id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/conciliacao/${id}/extrato`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Conciliar {conta.name}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Archive className="size-6 text-primary-text" />
          Linhas arquivadas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Linhas do extrato que você tirou da conciliação (duplicatas, transferências
          internas…). Elas não entram no espelho do sistema — mas dá para trazer de volta.
        </p>
      </div>

      {linhas.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma linha arquivada nesta conta.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {linhas.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.description}</p>
                <p className="text-xs text-muted-foreground">{d(l.date)}</p>
              </div>
              <span className={cn("tabular text-sm font-semibold", l.amount < 0 ? "text-expense" : "text-income")}>
                {l.amount < 0 ? "−" : "+"} {formatMoney(Math.abs(l.amount), conta.currency)}
              </span>
              <form action={desarquivarLinha}>
                <input type="hidden" name="linhaId" value={l.id} />
                <input type="hidden" name="accountId" value={id} />
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  <RotateCcw className="size-3.5" />
                  Desarquivar
                </button>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
