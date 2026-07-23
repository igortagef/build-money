"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createPersonalLedger } from "@/db/seed";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  checarBloqueio,
  registrarTentativa,
  mensagemBloqueio,
  limparTentativasAntigas,
} from "@/lib/rate-limit";
import { semQuebrar } from "@/lib/gamification";
import { registrarAuditoria } from "@/lib/auditoria";
import { diasAteData } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";
import {
  sistemaVazio,
  validarConvite,
  consumirConvite,
  cadastroAbertoPorConfig,
} from "@/lib/convites";

/**
 * `values` devolve o que o usuário digitou. O React 19 limpa formulários
 * automaticamente após uma Server Action, então sem isso um erro de senha
 * apagaria também o e-mail já preenchido.
 * A senha nunca volta — só os campos que não são segredo.
 */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { name?: string; email?: string };
};

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z
    .string()
    .min(8, "A senha precisa ter ao menos 8 caracteres")
    .max(200),
});

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export async function signUp(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const submitted = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values: submitted };
  }

  const { name, email, password } = parsed.data;

  // Cadastro fechado: só entra com convite. A exceção é o primeiro usuário do
  // sistema (o dono), que precisa existir para poder emitir os convites.
  // Duas coisas distintas: quem vira ADMIN (só o primeiro usuário do sistema)
  // e quando o convite é DISPENSADO (primeiro usuário ou cadastro aberto nos
  // testes). Misturar as duas faria todo cadastro de teste virar admin.
  const primeiro = await sistemaVazio();
  const exigeConvite = !primeiro && !cadastroAbertoPorConfig();
  let inviteId: string | undefined;

  if (exigeConvite) {
    const conv = await validarConvite(String(formData.get("convite") ?? ""));
    if (!conv.ok) {
      return { fieldErrors: { convite: conv.erro! }, values: submitted };
    }
    inviteId = conv.inviteId;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return {
      fieldErrors: { email: "Já existe uma conta com este e-mail" },
      values: submitted,
    };
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash, isAdmin: primeiro })
    .returning({ id: users.id });

  // Consome o convite. Se outra pessoa o usou entre a validação e agora, o
  // banco recusa aqui e o cadastro não prossegue.
  if (inviteId) {
    const consumido = await consumirConvite(inviteId, user.id);
    if (!consumido) {
      await db.delete(users).where(eq(users.id, user.id));
      return {
        fieldErrors: { convite: "Este convite acabou de ser utilizado." },
        values: submitted,
      };
    }
  }

  await registrarAuditoria({
    userId: user.id,
    action: "account_created",
    detail: { admin: primeiro, viaConvite: Boolean(inviteId) },
  });

  // O primeiro usuário é o ADMIN (back-office): não ganha espaço financeiro e
  // entra direto no console. Os demais são usuários de finanças, com espaço.
  if (primeiro) {
    await createSession({ userId: user.id });
    redirect("/admin");
  }

  // Cria o espaço pessoal já com categorias e centros de custo sugeridos.
  const ledger = await createPersonalLedger(user.id, { name: "Minhas finanças" });
  await createSession({ userId: user.id, ledgerId: ledger.id });
  redirect("/");
}

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const submitted = { email: String(formData.get("email") ?? "") };

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values: submitted };
  }

  const { email, password } = parsed.data;

  // Trava de força bruta ANTES de qualquer verificação: sem isso, um atacante
  // testa senhas à vontade. O bloqueio é por e-mail tentado, contado no banco.
  const bloqueio = await checarBloqueio(email, "login");
  if (bloqueio.bloqueado) {
    return { error: mensagemBloqueio(bloqueio), values: submitted };
  }

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      defaultLedgerId: users.defaultLedgerId,
      deactivatedAt: users.deactivatedAt,
      accessUntil: users.accessUntil,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Mensagem genérica de propósito: dizer "e-mail não existe" entregaria a
  // atacantes quais e-mails têm conta.
  const genericError = {
    error: "E-mail ou senha incorretos",
    values: submitted,
  };

  if (!user?.passwordHash) {
    // Gasta o mesmo tempo de um hash real para não vazar, pelo tempo de
    // resposta, se o e-mail existe.
    await hashPassword(password);
    await registrarTentativa(email, "login", false);
    await registrarAuditoria({ userEmail: email, action: "login_failed", detail: { motivo: "email_inexistente" } });
    return genericError;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await registrarTentativa(email, "login", false);
    await registrarAuditoria({ userId: user.id, action: "login_failed", detail: { motivo: "senha_incorreta" } });
    return genericError;
  }

  // Sucesso zera o contador de falhas da janela.
  await registrarTentativa(email, "login", true);
  await registrarAuditoria({
    userId: user.id,
    action: "login_success",
    detail: user.isAdmin ? { conta: "admin" } : user.deactivatedAt ? { conta: "desativada" } : undefined,
  });
  await semQuebrar(() => limparTentativasAntigas());

  // Conta de admin: sessão SEM ledger, direto ao console de administração.
  // O admin é back-office puro e não acessa finanças.
  if (user.isAdmin) {
    await createSession({ userId: user.id });
    redirect("/admin");
  }

  if (!user.defaultLedgerId) {
    const ledger = await createPersonalLedger(user.id);
    await createSession({ userId: user.id, ledgerId: ledger.id });
  } else {
    await createSession({ userId: user.id, ledgerId: user.defaultLedgerId });
  }

  // Conta desativada OU com prazo vencido entra, mas só na área restrita de
  // exportar/excluir dados.
  const vencido = Boolean(user.accessUntil) && diasAteData(user.accessUntil!) < 0;
  redirect(user.deactivatedAt || vencido ? "/conta" : "/");
}

export async function signOut() {
  await destroySession();
  redirect("/entrar");
}
