"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireContaAccess } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { excluirConta } from "@/lib/meus-dados";
import { registrarAuditoria } from "@/lib/auditoria";
import { destroySession } from "@/lib/session";

export type ExcluirState = { erro?: string };

export type FotoState = { ok?: boolean; erro?: string };

// A foto chega como data URL já redimensionada no navegador. Aceitamos só
// formatos raster (nada de SVG, que pode carregar script) e limitamos o tamanho
// para não inchar o banco — é avatar, não álbum.
const FOTO_MAX_BYTES = 400_000; // ~400 KB depois do redimensionamento
const RE_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** Define (ou troca) a foto de perfil da pessoa. */
export async function atualizarFoto(_prev: FotoState, formData: FormData): Promise<FotoState> {
  const { userId } = await requireContaAccess();
  const dataUrl = String(formData.get("foto") ?? "");

  if (!RE_FOTO.test(dataUrl)) {
    return { erro: "Envie uma imagem válida (JPEG, PNG ou WebP)." };
  }
  // Tamanho aproximado dos bytes decodificados do base64.
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > FOTO_MAX_BYTES) {
    return { erro: "A imagem ficou grande demais. Tente uma foto menor." };
  }

  await db.update(users).set({ imageUrl: dataUrl, updatedAt: new Date() }).where(eq(users.id, userId));
  await registrarAuditoria({ userId, action: "profile_photo_updated" });
  revalidatePath("/conta");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Remove a foto de perfil, voltando às iniciais. */
export async function removerFoto(): Promise<void> {
  const { userId } = await requireContaAccess();
  await db.update(users).set({ imageUrl: null, updatedAt: new Date() }).where(eq(users.id, userId));
  await registrarAuditoria({ userId, action: "profile_photo_removed" });
  revalidatePath("/conta");
  revalidatePath("/", "layout");
}

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
