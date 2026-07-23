import Link from "next/link";
import { Plus, Target, Trophy, TrendingUp, CalendarClock, Pencil } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getMetasComProgresso } from "@/lib/goals";
import { formatMoney } from "@/lib/money";
import { buttonClasses, Card, cn } from "@/components/ui";
import { AporteForm } from "./aporte-form";
import { DeleteGoalButton } from "./delete-button";

export const metadata = { title: "Metas · Build Money" };

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatarData(iso: string) {
  return DATA.format(new Date(`${iso}T12:00:00`));
}

export default async function MetasPage() {
  const { ledgerId } = await requireAccess();
  const metas = await getMetasComProgresso(ledgerId);

  const ativas = metas.filter((m) => m.status === "active");
  const concluidas = metas.filter((m) => m.status === "achieved");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Metas</h1>
        <Link href="/metas/nova" className={buttonClasses()}>
          <Plus className="size-4" />
          Nova meta
        </Link>
      </div>

      {metas.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-subtle text-primary-text">
            <Target className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-semibold">Nenhuma meta ainda</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Uma reserva de emergência, uma viagem, a entrada de um imóvel.
              Defina o valor e acompanhe o quanto falta.
            </p>
          </div>
          <Link href="/metas/nova" className={buttonClasses("primary", "lg")}>
            <Plus className="size-4" />
            Criar primeira meta
          </Link>
        </Card>
      ) : (
        <>
          {ativas.length > 0 && (
            <section className="space-y-3">
              {ativas.map((m) => (
                <MetaCard key={m.id} meta={m} />
              ))}
            </section>
          )}

          {concluidas.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Concluídas
              </h2>
              {concluidas.map((m) => (
                <MetaCard key={m.id} meta={m} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MetaCard({
  meta,
}: {
  meta: Awaited<ReturnType<typeof getMetasComProgresso>>[number];
}) {
  const concluida = meta.status === "achieved";

  return (
    <Card className={cn("overflow-hidden", concluida && "border-xp-border")}>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              concluida
                ? "bg-xp text-xp-foreground"
                : "bg-primary-subtle text-primary-text",
            )}
            aria-hidden
          >
            {concluida ? (
              <Trophy className="size-5" />
            ) : (
              <Target className="size-5" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate font-semibold">{meta.name}</h3>
              <span className="tabular shrink-0 text-sm font-semibold">
                {meta.percentual}%
              </span>
            </div>
            {meta.description && (
              <p className="truncate text-xs text-muted-foreground">
                {meta.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <Link
              href={`/metas/${meta.id}/editar`}
              aria-label={`Editar meta ${meta.name}`}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Pencil className="size-4" />
            </Link>
            <DeleteGoalButton id={meta.id} nome={meta.name} />
          </div>
        </div>

        <div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuenow={meta.percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso da meta ${meta.name}`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                concluida ? "bg-xp" : "bg-primary",
              )}
              style={{ width: `${meta.percentual}%` }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="tabular font-semibold">
              {formatMoney(meta.guardado, meta.currency)}
              <span className="font-normal text-muted-foreground">
                {" de "}
                {formatMoney(meta.targetAmount, meta.currency)}
              </span>
            </span>
            {!concluida && (
              <span className="tabular text-xs text-muted-foreground">
                faltam {formatMoney(meta.falta, meta.currency)}
              </span>
            )}
          </div>
        </div>

        {concluida ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-xp-text">
            <Trophy className="size-4" aria-hidden />
            Meta atingida
            {meta.achievedAt &&
              ` em ${DATA.format(meta.achievedAt)}`}
          </p>
        ) : (
          <>
            {/*
              A projeção usa o ritmo REAL de aportes, não o que seria
              necessário. Uma meta que diz "você consegue!" sem base no
              comportamento da pessoa é decoração, não ferramenta.
            */}
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              {meta.targetDate && (
                <Info
                  Icon={CalendarClock}
                  label="Data alvo"
                  valor={formatarData(meta.targetDate)}
                />
              )}
              {meta.precisaPorMes !== null && (
                <Info
                  Icon={TrendingUp}
                  label="Precisa guardar"
                  valor={`${formatMoney(meta.precisaPorMes, meta.currency)}/mês`}
                />
              )}
            </div>

            {meta.qtdAportes > 0 && meta.previsao && (
              <p
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  meta.noRitmo === false
                    ? "border-warning/25 bg-xp-subtle text-warning"
                    : "border-income/25 bg-income-subtle text-income",
                )}
              >
                {meta.noRitmo === false ? (
                  <>
                    No seu ritmo atual de{" "}
                    <strong className="tabular">
                      {formatMoney(meta.ritmoMensal, meta.currency)}/mês
                    </strong>
                    , você chegaria em {formatarData(meta.previsao)} — depois da
                    data alvo.
                  </>
                ) : (
                  <>
                    No seu ritmo atual de{" "}
                    <strong className="tabular">
                      {formatMoney(meta.ritmoMensal, meta.currency)}/mês
                    </strong>
                    , você chega em {formatarData(meta.previsao)}.
                  </>
                )}
              </p>
            )}

            <AporteForm goalId={meta.id} currency={meta.currency} />
          </>
        )}
      </div>
    </Card>
  );
}

function Info({
  Icon,
  label,
  valor,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  valor: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}:{" "}
      <strong className="tabular font-semibold text-foreground">{valor}</strong>
    </span>
  );
}
