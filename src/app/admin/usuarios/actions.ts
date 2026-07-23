"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  desativarUsuario,
  reativarUsuario,
  definirPrazoAcesso,
  definirClassificacao,
} from "@/lib/admin-usuarios";

export async function inativarUsuario(formData: FormData): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const alvoId = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "inativado") === "cancelado" ? "cancelado" : "inativado";

  const r = await desativarUsuario(alvoId, adminId, motivo);
  if (r.ok) {
    await registrarAuditoria({ userId: adminId, action: "user_deactivated", detail: { alvoId, motivo } });
  }
  revalidatePath("/admin/usuarios");
}

export async function ativarUsuario(formData: FormData): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const alvoId = String(formData.get("id") ?? "");

  const r = await reativarUsuario(alvoId);
  if (r.ok) {
    await registrarAuditoria({ userId: adminId, action: "user_reactivated", detail: { alvoId } });
  }
  revalidatePath("/admin/usuarios");
}

export async function editarPrazo(formData: FormData): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const alvoId = String(formData.get("id") ?? "");
  const bruto = String(formData.get("dias") ?? "").trim();
  // Vazio = sem prazo (ilimitado); número = dias a partir de hoje.
  const dias = bruto === "" ? null : Math.trunc(Number(bruto));
  if (dias !== null && !Number.isFinite(dias)) return;

  const r = await definirPrazoAcesso(alvoId, dias);
  if (r.ok) {
    await registrarAuditoria({ userId: adminId, action: "user_access_term_set", detail: { alvoId, dias } });
  }
  revalidatePath("/admin/usuarios");
}

export async function editarClassificacao(formData: FormData): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const alvoId = String(formData.get("id") ?? "");
  const valor = String(formData.get("classificacao") ?? "").trim() || null;

  const r = await definirClassificacao(alvoId, valor);
  if (r.ok) {
    await registrarAuditoria({ userId: adminId, action: "user_classified", detail: { alvoId, classificacao: valor } });
  }
  revalidatePath("/admin/usuarios");
}
