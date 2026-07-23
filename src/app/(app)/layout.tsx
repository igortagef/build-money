import { AlertTriangle, CalendarClock } from "lucide-react";
import { requireContaAccess } from "@/lib/auth";
import { cn } from "@/components/ui";
import { checkInDiario, getProgresso, semQuebrar } from "@/lib/gamification";
import { provisionarLedger, confirmarAutomaticos } from "@/lib/provisioning";
import { fecharFaturasVencidas } from "@/lib/faturas-ops";
import { getAtencaoMenu } from "@/lib/menu";
import { getAlertas } from "@/lib/alertas";
import { AlertasBell } from "@/components/alertas-bell";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { ProgressBadge } from "@/components/progress-badge";
import { AmbientBackground } from "@/components/ambient-background";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Toda página autenticada passa por aqui. Aceitamos a conta desativada porque
  // ela ainda pode exportar/excluir os próprios dados — mas com um shell mínimo,
  // sem menu nem controle financeiro. As demais páginas redirecionam para /conta
  // por conta própria (via requireAccess), então aqui só entregamos a casca.
  const access = await requireContaAccess();

  if (access.deactivated) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AmbientBackground />
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu name={access.userName} email={access.userEmail} />
          </div>
        </header>
        <div className="flex items-center gap-2 border-b border-warning/25 bg-xp-subtle px-4 py-2 text-sm text-warning lg:px-6">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Sua conta está inativa. Você ainda pode exportar ou excluir seus dados abaixo.
          </span>
        </div>
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
    );
  }

  /*
   * O check-in acontece ao abrir qualquer página do app: a ofensiva mede o
   * hábito de acompanhar as finanças, não o de clicar num botão de presença.
   *
   * É idempotente pela chave "daily:<data>", então navegar por 20 páginas no
   * mesmo dia concede XP uma vez só. E vai dentro de `semQuebrar` porque uma
   * falha na gamificação não pode impedir alguém de ver o próprio saldo.
   */
  await semQuebrar(() => checkInDiario(access.userId, access.ledgerId));

  /*
   * Provisiona as contas fixas dos próximos 12 meses.
   *
   * É idempotente (índice único por regra+data), então rodar a cada
   * navegação não duplica nada. Vai em `semQuebrar` pelo mesmo motivo do
   * check-in: uma falha aqui não pode impedir alguém de ver o próprio saldo.
   */
  await semQuebrar(async () => {
    await provisionarLedger(access.ledgerId);
    await confirmarAutomaticos(access.ledgerId);
    // Fecha, na data, as faturas cujo ciclo já encerrou — como o banco faz.
    await fecharFaturasVencidas(access.ledgerId);
  });

  const [progresso, atencao, alertas] = await Promise.all([
    getProgresso(access.userId),
    getAtencaoMenu(access.ledgerId),
    getAlertas(access.ledgerId, access.baseCurrency),
  ]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AmbientBackground />
      <AppNav atencao={atencao} />

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-end gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
          {access.diasRestantes !== null && (
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex",
                access.diasRestantes <= 7
                  ? "bg-xp-subtle text-warning"
                  : "bg-surface-muted text-muted-foreground",
              )}
              title="Dias de acesso restantes ao Build Money"
            >
              <CalendarClock className="size-3.5" />
              {access.diasRestantes === 0
                ? "Último dia de acesso"
                : `${access.diasRestantes} ${access.diasRestantes === 1 ? "dia" : "dias"} de acesso`}
            </span>
          )}
          <ProgressBadge
            xp={progresso.xp}
            ofensiva={progresso.currentStreak}
          />
          <span className="h-6 w-px bg-border" aria-hidden />
          <AlertasBell alertas={alertas} />
          <ThemeToggle />
          <UserMenu name={access.userName} email={access.userEmail} />
        </header>

        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
    </div>
  );
}
