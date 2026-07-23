"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarConvite, revogarConvite } from "@/lib/convites";

export async function gerarConvite(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const nota = String(formData.get("nota") ?? "");
  const convite = await criarConvite(userId, nota);
  await registrarAuditoria({
    userId,
    action: "invite_created",
    detail: { inviteId: convite.id, nota: nota || null },
  });
  revalidatePath("/admin/convites");
}

export async function cancelarConvite(formData: FormData): Promise<void> {
  const { userId } = await requireAdmin();
  const inviteId = String(formData.get("id") ?? "");
  await revogarConvite(inviteId);
  await registrarAuditoria({ userId, action: "invite_revoked", detail: { inviteId } });
  revalidatePath("/admin/convites");
}
