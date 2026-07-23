import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";

/**
 * Trilha de auditoria das ações sensíveis (login, troca de senha, 2FA, convites,
 * exclusões). Num app que guarda a vida financeira de alguém, poder responder
 * "quem fez o quê, quando e de onde" é requisito, não enfeite.
 *
 * Nunca deve derrubar a operação principal: registrar auditoria é secundário ao
 * ato em si, então qualquer erro aqui é engolido.
 */
export async function registrarAuditoria(dados: {
  userId?: string;
  userEmail?: string;
  ledgerId?: string;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    let userId = dados.userId;
    // Aceita e-mail quando ainda não temos o id (ex.: pedido de reset).
    if (!userId && dados.userEmail) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, dados.userEmail.toLowerCase().trim()))
        .limit(1);
      userId = u?.id;
    }

    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip");

    await db.insert(auditLog).values({
      userId: userId ?? null,
      ledgerId: dados.ledgerId ?? null,
      action: dados.action,
      detail: dados.detail ?? null,
      ip,
      userAgent: h.get("user-agent"),
    });
  } catch {
    // Auditoria nunca quebra o fluxo principal.
  }
}
