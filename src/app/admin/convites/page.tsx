import { Ticket, Plus, X, Check } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarConvites, contarLicencas } from "@/lib/convites";
import { buttonClasses, Card, cn } from "@/components/ui";
import { gerarConvite, cancelarConvite } from "./actions";

export const metadata = { title: "Convites · Administração" };

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export default async function ConvitesPage() {
  await requireAdmin();

  const [convites, licencas] = await Promise.all([listarConvites(), contarLicencas()]);
  const disponiveis = convites.filter((c) => !c.usedAt && !c.revokedAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Ticket className="size-6 text-primary-text" />
          Convites
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O cadastro é fechado: só cria conta quem tem um código. Gere um por pessoa
          e envie pelo canal que preferir.
        </p>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Emitidos</p>
            <p className="tabular text-lg font-semibold">{licencas.total}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Em uso</p>
            <p className="tabular text-lg font-semibold text-income">{licencas.usadas}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Disponíveis</p>
            <p className="tabular text-lg font-semibold">{disponiveis}</p>
          </div>
        </div>

        <form action={gerarConvite} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Para quem (opcional)
            <input
              name="nota"
              placeholder="Ex.: João"
              className="mt-1 block h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
            />
          </label>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            <Plus className="size-4" />
            Gerar convite
          </button>
        </form>
      </Card>

      {convites.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum convite ainda. Gere o primeiro acima.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {convites.map((c) => {
            const usado = Boolean(c.usedAt);
            const cancelado = Boolean(c.revokedAt);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                <span
                  className={cn(
                    "tabular rounded-lg px-2.5 py-1 text-sm font-bold tracking-wider",
                    usado || cancelado
                      ? "bg-surface-muted text-muted-foreground line-through"
                      : "bg-primary-subtle text-primary-text",
                  )}
                >
                  {c.code}
                </span>

                <div className="min-w-0 flex-1">
                  {c.nota && <p className="truncate text-sm font-medium">{c.nota}</p>}
                  <p className="truncate text-xs text-muted-foreground">
                    {usado
                      ? `Usado por ${c.usadoPor ?? c.usadoPorEmail ?? "alguém"} em ${DATA.format(c.usedAt!)}`
                      : cancelado
                        ? "Cancelado"
                        : `Criado em ${DATA.format(c.createdAt)} · disponível`}
                  </p>
                </div>

                {usado ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-income">
                    <Check className="size-3.5" />
                    em uso
                  </span>
                ) : cancelado ? null : (
                  <form action={cancelarConvite}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      aria-label={`Cancelar convite ${c.code}`}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
                    >
                      <X className="size-4" />
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
