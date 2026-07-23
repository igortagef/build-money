import { Users, AlertTriangle, Ban, RotateCcw, Activity, Receipt, CalendarClock } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listarUsuariosAdmin } from "@/lib/admin-usuarios";
import { rotuloClassificacao } from "@/lib/user-classificacao";
import { buttonClasses, Card, cn } from "@/components/ui";
import { inativarUsuario, ativarUsuario } from "./actions";
import { ControlesUsuario } from "./controles";

export const metadata = { title: "Usuários · Administração" };

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const DIAS_ALERTA = 7;

function iniciais(nome: string | null, email: string) {
  return (nome ?? email).split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default async function UsuariosPage() {
  await requireAdmin();

  // Só usuários de finanças: contas de admin não são licenças.
  const lista = (await listarUsuariosAdmin()).filter((u) => !u.isAdmin);
  const ativos = lista.filter((u) => !u.desativadoEm).length;
  const inativos = lista.length - ativos;
  const semUsar = lista.filter((u) => !u.desativadoEm && (u.diasSemAbrir ?? 999) >= DIAS_ALERTA).length;
  const expirando = lista.filter(
    (u) => !u.desativadoEm && u.diasRestantes !== null && u.diasRestantes >= 0 && u.diasRestantes <= 7,
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="size-6 text-primary-text" />
          Usuários
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie as licenças e acompanhe o uso. Você vê apenas números — nunca os
          lançamentos ou dados financeiros de ninguém.
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-x-10 gap-y-3 p-5">
        <div>
          <p className="text-sm text-muted-foreground">Ativos</p>
          <p className="tabular text-2xl font-semibold text-income">{ativos}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Desativados</p>
          <p className="tabular text-2xl font-semibold">{inativos}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Sem abrir há {DIAS_ALERTA}+ dias</p>
          <p className={cn("tabular text-2xl font-semibold", semUsar > 0 ? "text-warning" : "")}>{semUsar}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Prazo acabando (7d)</p>
          <p className={cn("tabular text-2xl font-semibold", expirando > 0 ? "text-warning" : "")}>{expirando}</p>
        </div>
      </Card>

      {lista.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum usuário de finanças ainda. Gere um convite para liberar o primeiro.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {lista.map((u) => {
            const desativado = Boolean(u.desativadoEm);
            const alerta = !desativado && (u.diasSemAbrir ?? 999) >= DIAS_ALERTA;
            const dr = u.diasRestantes;
            const vencido = !desativado && dr !== null && dr < 0;
            const acabando = !desativado && dr !== null && dr >= 0 && dr <= 7;

            return (
              <div key={u.id} data-email={u.email} className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold",
                      desativado ? "bg-surface-muted text-muted-foreground" : "bg-primary-subtle text-primary-text",
                    )}
                  >
                    {iniciais(u.name, u.email)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      <span className="truncate">{u.name ?? u.email}</span>
                      {u.classificacao && (
                        <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary-text">
                          {rotuloClassificacao(u.classificacao)}
                        </span>
                      )}
                      {desativado && (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {u.motivoDesativacao === "cancelado" ? "cancelado" : "inativado"}
                        </span>
                      )}
                      {vencido && (
                        <span className="rounded-full bg-expense-subtle px-2 py-0.5 text-xs font-semibold text-expense">
                          prazo vencido
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Receipt className="size-4" /> {u.lancamentos} lanç.
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Activity className="size-4" /> {u.atividades} ativ.
                      </span>
                      <span className={cn("inline-flex items-center gap-1.5", alerta && "font-medium text-warning")}>
                        {alerta && <AlertTriangle className="size-4" />}
                        {u.ultimoAcesso
                          ? u.diasSemAbrir === 0
                            ? "abriu hoje"
                            : `há ${u.diasSemAbrir} ${u.diasSemAbrir === 1 ? "dia" : "dias"} sem abrir`
                          : "nunca abriu"}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          vencido ? "font-medium text-expense" : acabando ? "font-medium text-warning" : "",
                        )}
                      >
                        <CalendarClock className="size-4" />
                        {dr === null
                          ? "sem prazo"
                          : dr < 0
                            ? `venceu há ${-dr} ${-dr === 1 ? "dia" : "dias"}`
                            : dr === 0
                              ? "vence hoje"
                              : `${dr} ${dr === 1 ? "dia" : "dias"} de acesso`}
                      </span>
                      <span className="text-muted-foreground/70">desde {DATA.format(u.criadoEm)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {desativado ? (
                      <form action={ativarUsuario}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className={buttonClasses("secondary", "md")}>
                          <RotateCcw className="size-4" />
                          Reativar
                        </button>
                      </form>
                    ) : (
                      <>
                        <form action={inativarUsuario}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="motivo" value="inativado" />
                          <button type="submit" className={buttonClasses("ghost", "md")}>
                            Inativar
                          </button>
                        </form>
                        <form action={inativarUsuario}>
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="motivo" value="cancelado" />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-expense transition-colors hover:bg-expense-subtle"
                          >
                            <Ban className="size-4" />
                            Cancelar
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>

                {/* Classificação e prazo editáveis */}
                <div className="sm:pl-[60px]">
                  <ControlesUsuario id={u.id} classificacao={u.classificacao} diasRestantes={u.diasRestantes} />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        <strong>Inativar</strong> pausa o acesso; <strong>cancelar</strong> encerra a
        licença. Ambos são reversíveis e derrubam a sessão na hora — nenhum dado é
        apagado. Mesmo inativa, a pessoa ainda consegue exportar ou excluir os próprios
        dados (direito garantido por lei).
      </p>
    </div>
  );
}
