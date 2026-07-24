"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { hashPassword } from "@/lib/password";
import { criarTokenReset, redefinirSenhaComToken } from "@/lib/password-reset";
import {
  checarBloqueio,
  registrarTentativa,
  mensagemBloqueio,
} from "@/lib/rate-limit";
import { registrarAuditoria } from "@/lib/auditoria";
import { enviarEmail, emailRecuperacaoSenha } from "@/lib/email";

export type ResetState = { ok?: boolean; erro?: string; msg?: string };

/**
 * Passo 1: pedir o link. A resposta é SEMPRE a mesma — exista o e-mail ou não —
 * para não revelar quais e-mails têm conta. Também é limitada por tentativas.
 *
 * Enquanto não há provedor de e-mail (Fase 2), o link sai no LOG DO SERVIDOR
 * para você conseguir testar o fluxo ponta a ponta.
 */
export async function pedirReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const parsed = z.string().email().safeParse(email);

  const respostaGenerica: ResetState = {
    ok: true,
    msg: "Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.",
  };
  if (!parsed.success) return respostaGenerica;

  const bloqueio = await checarBloqueio(email, "reset");
  if (bloqueio.bloqueado) return { erro: mensagemBloqueio(bloqueio) };
  await registrarTentativa(email, "reset", false);

  const token = await criarTokenReset(email);
  if (token) {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const link = `${base}/redefinir-senha?token=${token}`;
    // Envia por e-mail (Resend). Sem provedor configurado, cai no log — o app
    // não bloqueia na fase de testes.
    await enviarEmail({ to: email, ...emailRecuperacaoSenha(link) });
    await registrarAuditoria({ userEmail: email, action: "password_reset_requested" });
  }

  return respostaGenerica;
}

const senhaSchema = z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(200);

/** Passo 2: com o token válido, define a nova senha (e derruba as sessões). */
export async function redefinirSenha(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const senha = String(formData.get("password") ?? "");

  const parsed = senhaSchema.safeParse(senha);
  if (!parsed.success) return { erro: parsed.error.issues[0]!.message };

  const hash = await hashPassword(senha);
  const r = await redefinirSenhaComToken(token, hash);
  if (!r.ok) return { erro: r.erro };

  await registrarAuditoria({ userId: r.userId, action: "password_reset_completed" });
  redirect("/entrar?redefinida=1");
}
