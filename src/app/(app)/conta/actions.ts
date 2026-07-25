"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireContaAccess } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { excluirConta } from "@/lib/meus-dados";
import { registrarAuditoria } from "@/lib/auditoria";
import { destroySession } from "@/lib/session";

export type ExcluirState = { erro?: string };

/**
 * Exclui a conta e todos os dados. É irreversível, então exige a senha e a
 * digitação de "EXCLUIR" — duas confirmações independentes, para não acontecer
 * por engano.
 */
export async function excluirMinhaConta(
  _prev: ExcluirState,
  formData: FormData,
): Promise<ExcluirState> {
  const { userId } = await requireContaAccess();
  const senha = String(formData.get("password") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "").trim();

  if (confirmacao !== "EXCLUIR") {
    return { erro: 'Digite EXCLUIR (em maiúsculas) para confirmar.' };
  }

  const [u] = await db
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!u?.passwordHash || !(await verifyPassword(senha, u.passwordHash))) {
    return { erro: "Senha incorreta." };
  }

  // Registra ANTES de apagar (depois o userId some).
  await registrarAuditoria({ userId, action: "account_deleted", detail: { email: u.email } });
  await excluirConta(userId);
  await destroySession();
  redirect("/entrar?excluida=1");
}
