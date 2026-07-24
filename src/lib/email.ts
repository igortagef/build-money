import "server-only";

/**
 * Envio de e-mail transacional (recuperação de senha, avisos de segurança).
 *
 * Provedor-agnóstico e sem dependência nova: fala com a API do Resend por
 * `fetch`. Enquanto `RESEND_API_KEY` não estiver configurada, cai no LOG do
 * servidor — assim o app funciona na fase de testes sem bloquear, e passa a
 * enviar de verdade no momento em que a chave (e o domínio) forem definidos.
 *
 * Configuração (variáveis de ambiente):
 *   RESEND_API_KEY  — chave da conta Resend
 *   EMAIL_FROM      — remetente verificado (ex.: "Build Money <nao-responda@seu-dominio>")
 */
export type EmailParams = { to: string; subject: string; html: string; text: string };

const FROM = process.env.EMAIL_FROM ?? "Build Money <onboarding@resend.dev>";

export async function enviarEmail({ to, subject, html, text }: EmailParams): Promise<{ ok: boolean; via: "resend" | "log" }> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.log(`\n[E-MAIL — provedor não configurado; caindo no log]\nPara: ${to}\nAssunto: ${subject}\n${text}\n`);
    return { ok: true, via: "log" };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
    });
    if (!resp.ok) {
      console.error("[E-MAIL] Resend recusou:", resp.status, await resp.text().catch(() => ""));
      return { ok: false, via: "resend" };
    }
    return { ok: true, via: "resend" };
  } catch (e) {
    console.error("[E-MAIL] falha ao enviar:", e instanceof Error ? e.message : e);
    return { ok: false, via: "resend" };
  }
}

/** Escapa texto para interpolar com segurança no HTML do e-mail. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Casca de e-mail simples e segura (estilos inline, sem recursos externos). */
function molde(titulo: string, corpoHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
      <tr><td>
        <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#1b7c77">build money</p>
        <h1 style="margin:12px 0;font-size:18px">${esc(titulo)}</h1>
        ${corpoHtml}
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Build Money · versão beta. Se você não pediu isto, ignore este e-mail.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** E-mail de recuperação de senha. */
export function emailRecuperacaoSenha(link: string): Omit<EmailParams, "to"> {
  const html = molde(
    "Redefinir sua senha",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Você pediu para redefinir a senha da sua conta. O link abaixo vale por 30 minutos e só pode ser usado uma vez.</p>
     <p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#1b7c77;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">Redefinir senha</a></p>
     <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all">Ou copie e cole no navegador:<br>${esc(link)}</p>`,
  );
  return {
    subject: "Redefinir sua senha — Build Money",
    html,
    text: `Você pediu para redefinir a senha da sua conta Build Money.\nAbra o link (vale 30 min, uso único):\n${link}\n\nSe não foi você, ignore este e-mail.`,
  };
}
