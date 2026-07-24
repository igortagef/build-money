import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarErros } from "@/lib/error-log";
import { Card } from "@/components/ui";

export const metadata = { title: "Erros · Administração" };

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ErrosPage() {
  await requireAdmin();
  const erros = await listarErros(100);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <AlertTriangle className="size-6 text-primary-text" />
          Erros do sistema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Falhas de servidor registradas automaticamente. Ajuda a saber quando algo quebra,
          sem precisar olhar o log da máquina.
        </p>
      </div>

      {erros.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-income-subtle text-income">
            <CheckCircle2 className="size-6" />
          </span>
          <p className="font-medium">Nenhum erro registrado</p>
          <p className="text-sm text-muted-foreground">Está tudo funcionando por enquanto.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {erros.map((e) => (
            <details key={e.id} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-surface-muted">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-expense-subtle text-expense">
                  <AlertTriangle className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.message}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {DATA.format(e.createdAt)}
                    {e.path ? ` · ${e.method ?? ""} ${e.path}` : ""}
                    {e.routeType ? ` · ${e.routeType}` : ""}
                  </p>
                </div>
              </summary>
              {e.stack && (
                <pre className="overflow-x-auto border-t border-border bg-surface-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
                  {e.stack}
                </pre>
              )}
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}
