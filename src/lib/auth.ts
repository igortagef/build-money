import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ledgerMembers, ledgers, users } from "@/db/schema";
import { getSession } from "./session";
import type { MemberRole } from "@/db/schema";

/**
 * Fronteira de autorização do app.
 *
 * Server Actions são endpoints POST públicos: qualquer um pode chamá-las
 * diretamente, sem passar pela interface. Por isso toda ação e toda página
 * que lê dados precisa começar por `requireAccess()` — não basta esconder o
 * botão na tela.
 *
 * O cookie é assinado, então o `ledgerId` dentro dele não pode ser forjado.
 * Ainda assim conferimos o vínculo no banco a cada requisição, porque um
 * acesso pode ter sido revogado depois que o cookie foi emitido.
 */

/**
 * Dias inteiros de hoje até a data ISO (YYYY-MM-DD), no fuso local. Hoje = 0,
 * amanhã = 1, ontem = −1. Base do prazo de acesso (vale até o fim do dia-alvo).
 */
export function diasAteData(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export type Access = {
  userId: string;
  ledgerId: string;
  role: MemberRole;
  baseCurrency: "BRL" | "USD" | "EUR";
  userName: string | null;
  userEmail: string;
  // Conta sem acesso pleno (desativada pelo admin OU com prazo vencido): a
  // sessão ainda vale, mas o acesso é restrito a exportar/excluir os próprios
  // dados — direito garantido pela LGPD.
  deactivated: boolean;
  // Dias de acesso que ainda restam (prazo definido pelo admin). Nulo = sem
  // prazo. Negativo/zero = vencido. A pessoa vê isto no app.
  diasRestantes: number | null;
};

/**
 * `cache` deduplica a consulta dentro de uma mesma requisição: várias
 * chamadas em componentes diferentes fazem um único SELECT.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const session = await getSession();
  if (!session) return null;
  // Conta de admin (back-office) não tem espaço financeiro: sem ledger no
  // token, não há acesso a finanças — é o que a separa por completo dos dados.
  if (!session.ledgerId) return null;

  const [row] = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      ledgerId: ledgers.id,
      baseCurrency: ledgers.baseCurrency,
      role: ledgerMembers.role,
      // Revogação de sessão: tokens emitidos antes desta marca são recusados.
      sessionsValidFrom: users.sessionsValidFrom,
      // Conta desativada pelo admin corta o acesso imediatamente.
      deactivatedAt: users.deactivatedAt,
      lastSeenAt: users.lastSeenAt,
      // Prazo de acesso (data); vencido restringe como uma desativação.
      accessUntil: users.accessUntil,
      // Conta de admin nunca tem acesso a finanças, mesmo com sessão antiga.
      isAdmin: users.isAdmin,
    })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgerMembers.ledgerId, ledgers.id))
    .innerJoin(users, eq(ledgerMembers.userId, users.id))
    .where(
      and(
        eq(ledgerMembers.userId, session.userId),
        eq(ledgerMembers.ledgerId, session.ledgerId),
      ),
    )
    .limit(1);

  if (!row) return null;

  // Conta de admin é back-office puro: nunca acessa finanças, mesmo que uma
  // sessão antiga ainda traga um ledger. `requireAccess` a manda para /admin.
  if (row.isAdmin) return null;

  // Sessão revogada (troca de senha, 2FA, logout de todos os dispositivos, ou
  // desativação pelo admin): o token foi emitido antes do corte, não vale mais.
  if (row.sessionsValidFrom && session.iat) {
    if (session.iat * 1000 < row.sessionsValidFrom.getTime()) return null;
  }

  // Prazo de acesso: `diasRestantes` é exposto para a pessoa ver no app (nulo =
  // sem prazo). Vencido (dias < 0) restringe o acesso como uma desativação.
  const diasRestantes = row.accessUntil ? diasAteData(row.accessUntil) : null;
  const deactivated = Boolean(row.deactivatedAt) || (diasRestantes !== null && diasRestantes < 0);

  // Marca presença para o monitoramento de uso — no máximo 1x/hora, para não
  // transformar toda navegação numa escrita. Conta sem acesso pleno não conta
  // como "uso" (mantém o indicador honesto). Falha aqui nunca quebra o acesso.
  const agora = Date.now();
  if (!deactivated && (!row.lastSeenAt || agora - row.lastSeenAt.getTime() > 60 * 60 * 1000)) {
    try {
      await db.update(users).set({ lastSeenAt: new Date(agora) }).where(eq(users.id, row.userId));
    } catch {
      // presença é secundária: nunca derruba o acesso.
    }
  }

  return {
    userId: row.userId,
    ledgerId: row.ledgerId,
    role: row.role,
    baseCurrency: row.baseCurrency,
    userName: row.userName,
    userEmail: row.userEmail,
    deactivated,
    diasRestantes,
  };
});

/** userId se a sessão atual for de uma conta de administrador; senão null. */
async function contaAdminId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const [u] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  return u?.isAdmin ? session.userId : null;
}

/**
 * Exige sessão válida com acesso ao espaço. Sem sessão, vai ao login; se for
 * conta de admin, vai ao console `/admin` (o admin não acessa finanças); com a
 * conta desativada, o acesso é restrito a exportar/excluir os dados (`/conta`).
 */
export async function requireAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) {
    if (await contaAdminId()) redirect("/admin");
    redirect("/entrar");
  }
  if (access.deactivated) redirect("/conta");
  return access;
}

/**
 * Como `requireAccess`, mas ACEITA conta desativada. Só as telas de
 * portabilidade/exclusão dos próprios dados (a que a pessoa inativa ainda tem
 * direito) usam este guard; nenhuma delas mostra dado financeiro de terceiros.
 */
export async function requireContaAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) {
    if (await contaAdminId()) redirect("/admin");
    redirect("/entrar");
  }
  return access;
}

export type AdminIdentity = { userId: string; userName: string | null; userEmail: string };

/**
 * Fronteira do console de administração. Exige uma conta de admin — quem não
 * for é mandado de volta ao app. É o back-office puro: monitoramento de uso,
 * usuários e convites, sem NENHUM acesso a dados financeiros de ninguém.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!u?.isAdmin) redirect("/");
  return { userId: u.id, userName: u.name, userEmail: u.email };
}

/** Exige permissão de escrita. Visualizadores só consultam. */
export async function requireWriteAccess(): Promise<Access> {
  const access = await requireAccess();
  if (access.role === "viewer") {
    throw new Error("Seu acesso a este espaço é somente de consulta.");
  }
  return access;
}
