import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reimbursables, reimbursableParticipants, accounts } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card } from "@/components/ui";
import { ParticipantToggle } from "./participant-toggle";
import { DeleteRachaButton } from "./delete-button";

export const metadata = { title: "Rachas · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function RachasPage() {
  const { ledgerId, baseCurrency } = await requireAccess();

  const rachas = await db
    .select({
      id: reimbursables.id,
      description: reimbursables.description,
      totalAmount: reimbursables.totalAmount,
      myShare: reimbursables.myShare,
      amount: reimbursables.amount,
      settledAmount: reimbursables.settledAmount,
      currency: reimbursables.currency,
      status: reimbursables.status,
      date: reimbursables.date,
      accountName: accounts.name,
    })
    .from(reimbursables)
    .innerJoin(accounts, eq(reimbursables.accountId, accounts.id))
    .where(eq(reimbursables.ledgerId, ledgerId))
    .orderBy(asc(reimbursables.status), desc(reimbursables.date));

  // Participantes de todos os rachas, agrupados por racha.
  const ids = rachas.map((r) => r.id);
  const participantes = ids.length
    ? await db
        .select()
        .from(reimbursableParticipants)
        .where(inArray(reimbursableParticipants.reimbursableId, ids))
        .orderBy(asc(reimbursableParticipants.sortOrder))
    : [];

  type Participante = (typeof participantes)[number];
  const porRacha = new Map<string, Participante[]>();
  for (const p of participantes) {
    const arr = porRacha.get(p.reimbursableId) ?? [];
    arr.push(p);
    porRacha.set(p.reimbursableId, arr);
  }

  const abertos = rachas.filter((r) => r.status === "open");
  const quitados = rachas.filter((r) => r.status === "settled");
  const totalAReceber = abertos.reduce((s, r) => s + (r.amount - r.settledAmount), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rachas</h1>
          <p className="text-sm text-muted-foreground">
            Contas que você pagou e outras pessoas vão dividir. Acompanhe quem já
            pagou e quem falta.
          </p>
        </div>
        <Link href="/lancamentos/novo?aba=racha" className={buttonClasses()}>
          <Plus className="size-4" />
          Novo racha
        </Link>
      </div>

      {rachas.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary-text">
            <HandCoins className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-semibold">Nenhum racha ainda</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Pagou o rango da turma? Comprou um presente coletivo? Registre o
              total, marque quanto foi seu, e acompanhe quem te deve.
            </p>
          </div>
          <Link href="/lancamentos/novo?aba=racha" className={buttonClasses("primary", "lg")}>
            <Plus className="size-4" />
            Registrar o primeiro
          </Link>
        </Card>
      ) : (
        <>
          {totalAReceber > 0 && (
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Total a receber
              </p>
              <p className="tabular mt-1 text-2xl font-semibold text-primary-text">
                {formatMoney(totalAReceber, baseCurrency)}
              </p>
            </Card>
          )}

          {abertos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Em aberto</h2>
              {abertos.map((r) => (
                <RachaCard key={r.id} racha={r} participantes={porRacha.get(r.id) ?? []} />
              ))}
            </section>
          )}

          {quitados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Quitados</h2>
              {quitados.map((r) => (
                <RachaCard key={r.id} racha={r} participantes={porRacha.get(r.id) ?? []} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RachaCard({
  racha,
  participantes,
}: {
  racha: {
    id: string;
    description: string;
    myShare: number;
    amount: number;
    settledAmount: number;
    currency: "BRL" | "USD" | "EUR";
    status: string;
    date: string;
    accountName: string;
  };
  participantes: {
    id: string;
    name: string | null;
    amount: number;
    paidAt: Date | null;
  }[];
}) {
  const pagos = participantes.filter((p) => p.paidAt).length;
  return (
      <Card className={racha.status === "settled" ? "opacity-70" : undefined}>
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{racha.description}</p>
              <p className="truncate text-xs text-muted-foreground">
                {DATA.format(new Date(`${racha.date}T12:00:00`))} · saiu de{" "}
                {racha.accountName}
                {racha.myShare > 0 &&
                  ` · sua parte ${formatMoney(racha.myShare, racha.currency)} (despesa)`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular font-semibold text-primary-text">
                {formatMoney(racha.amount - racha.settledAmount, racha.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {pagos}/{participantes.length} pagaram
              </p>
            </div>
            <DeleteRachaButton id={racha.id} descricao={racha.description} />
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {participantes.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <ParticipantToggle
                  participantId={p.id}
                  nome={p.name ?? "Pessoa"}
                  pago={!!p.paidAt}
                />
                <span
                  className={
                    p.paidAt
                      ? "min-w-0 flex-1 truncate text-sm text-muted-foreground line-through"
                      : "min-w-0 flex-1 truncate text-sm"
                  }
                >
                  {p.name}
                </span>
                <span className="tabular shrink-0 text-sm font-medium">
                  {formatMoney(p.amount, racha.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
  );
}
