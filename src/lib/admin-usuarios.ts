import "server-only";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ledgers, transactions, users, xpEvents } from "@/db/schema";
import { classificacaoValida } from "./user-classificacao";

/** Data ISO (YYYY-MM-DD) daqui a `dias` dias, no fuso local. */
function dataEmDias(dias: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias inteiros de hoje até a data ISO (hoje = 0, ontem = −1). */
function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * Monitoramento de licenças para o administrador.
 *
 * PRIVACIDADE POR DESENHO: o admin vê apenas AGREGADOS — quantos lançamentos,
 * quantas atividades, há quantos dias a pessoa não abre o app. Nunca o conteúdo
 * dos lançamentos, nem qualquer valor, descrição ou categoria. Não há como
 * "entrar" no espaço de alguém por aqui: só se contam linhas, não se leem.
 */

export type UsuarioAdmin = {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  criadoEm: Date;
  ultimoAcesso: Date | null;
  diasSemAbrir: number | null; // null = nunca abriu (ou sem registro ainda)
  lancamentos: number;
  atividades: number;
  desativadoEm: Date | null;
  motivoDesativacao: string | null;
  classificacao: string | null;
  prazoAte: string | null; // data ISO do fim do acesso (null = sem prazo)
  diasRestantes: number | null; // dias até o prazo (negativo = vencido)
};

export async function listarUsuariosAdmin(): Promise<UsuarioAdmin[]> {
  const base = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isAdmin: users.isAdmin,
      criadoEm: users.createdAt,
      ultimoAcesso: users.lastSeenAt,
      desativadoEm: users.deactivatedAt,
      motivoDesativacao: users.deactivatedReason,
      classificacao: users.classificacao,
      prazoAte: users.accessUntil,
    })
    .from(users)
    .orderBy(users.createdAt);

  if (base.length === 0) return [];
  const ids = base.map((u) => u.id);

  // Lançamentos por DONO do espaço: conta linhas de transactions nos ledgers
  // que a pessoa possui. Só COUNT — nenhum dado do lançamento é lido.
  const lancRows = await db
    .select({
      ownerId: ledgers.ownerId,
      n: count(transactions.id),
    })
    .from(ledgers)
    .leftJoin(transactions, eq(transactions.ledgerId, ledgers.id))
    .where(inArray(ledgers.ownerId, ids))
    .groupBy(ledgers.ownerId);
  const lancPorUser = new Map(lancRows.map((r) => [r.ownerId, Number(r.n)]));

  // Atividades: eventos de XP que o app registra a cada ação relevante da
  // pessoa (por userId). Também só contagem.
  const ativRows = await db
    .select({ userId: xpEvents.userId, n: count(xpEvents.id) })
    .from(xpEvents)
    .where(inArray(xpEvents.userId, ids))
    .groupBy(xpEvents.userId);
  const ativPorUser = new Map(ativRows.map((r) => [r.userId, Number(r.n)]));

  const agora = Date.now();
  const diasDesde = (d: Date | null) =>
    d ? Math.floor((agora - d.getTime()) / 86_400_000) : null;

  return base.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    criadoEm: u.criadoEm,
    ultimoAcesso: u.ultimoAcesso,
    diasSemAbrir: diasDesde(u.ultimoAcesso),
    lancamentos: lancPorUser.get(u.id) ?? 0,
    atividades: ativPorUser.get(u.id) ?? 0,
    desativadoEm: u.desativadoEm,
    motivoDesativacao: u.motivoDesativacao,
    classificacao: u.classificacao,
    prazoAte: u.prazoAte,
    diasRestantes: u.prazoAte ? diasAte(u.prazoAte) : null,
  }));
}

/**
 * Define o prazo de acesso em DIAS a partir de hoje (0 = vence hoje; o acesso
 * vale até o fim do dia-alvo). `dias` null/negativo remove o prazo (sem limite).
 * Não mexe em admins. Encurtar o prazo derruba a sessão para valer na hora.
 */
export async function definirPrazoAcesso(
  alvoId: string,
  dias: number | null,
): Promise<{ ok: boolean; erro?: string }> {
  const [alvo] = await db
    .select({ id: users.id, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, alvoId))
    .limit(1);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  if (alvo.isAdmin) return { ok: false, erro: "Administrador não tem prazo de acesso." };

  const prazo = dias === null || dias < 0 ? null : dataEmDias(dias);
  await db
    .update(users)
    .set({
      accessUntil: prazo,
      // Prazo que já nasce vencido derruba a sessão na hora, como a desativação.
      ...(prazo && diasAte(prazo) < 0 ? { sessionsValidFrom: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, alvoId));
  return { ok: true };
}

/** Define (ou limpa) a classificação do usuário. */
export async function definirClassificacao(
  alvoId: string,
  valor: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  if (valor && !classificacaoValida(valor)) return { ok: false, erro: "Classificação inválida." };
  const [alvo] = await db.select({ id: users.id }).from(users).where(eq(users.id, alvoId)).limit(1);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };

  await db.update(users).set({ classificacao: valor, updatedAt: new Date() }).where(eq(users.id, alvoId));
  return { ok: true };
}

/**
 * Desativa ("inativa" ou "cancela") uma conta: corta o acesso e derruba as
 * sessões. Não apaga nada e não dá ao admin acesso aos dados — só bloqueia.
 * Idempotente. Um admin não pode se desativar (evita ficar sem administrador).
 */
export async function desativarUsuario(
  alvoId: string,
  adminId: string,
  motivo: "inativado" | "cancelado",
): Promise<{ ok: boolean; erro?: string }> {
  if (alvoId === adminId) return { ok: false, erro: "Você não pode desativar a própria conta." };

  const [alvo] = await db
    .select({ id: users.id, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, alvoId))
    .limit(1);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
  if (alvo.isAdmin) return { ok: false, erro: "Não é possível desativar um administrador." };

  await db
    .update(users)
    .set({
      deactivatedAt: new Date(),
      deactivatedReason: motivo,
      // Derruba qualquer sessão ativa da pessoa imediatamente.
      sessionsValidFrom: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, alvoId));
  return { ok: true };
}

/** Reativa uma conta desativada, devolvendo o acesso. */
export async function reativarUsuario(alvoId: string): Promise<{ ok: boolean; erro?: string }> {
  const [alvo] = await db.select({ id: users.id }).from(users).where(eq(users.id, alvoId)).limit(1);
  if (!alvo) return { ok: false, erro: "Usuário não encontrado." };

  await db
    .update(users)
    .set({ deactivatedAt: null, deactivatedReason: null, updatedAt: new Date() })
    .where(eq(users.id, alvoId));
  return { ok: true };
}
