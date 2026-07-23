import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "financas_sessao";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET não definida — veja .env.example");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  // Espaço financeiro ativo. AUSENTE nas contas de administrador, que são de
  // back-office puro (só monitoramento/convites) e não têm finanças.
  ledgerId?: string;
  // Emissão do token (epoch em segundos). Serve para revogar sessões: se for
  // anterior ao users.sessions_valid_from, a sessão é recusada.
  iat?: number;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());

  // A partir do Next 16 cookies() é assíncrono.
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true, // inacessível a JavaScript no navegador
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecret(), {
      algorithms: ["HS256"],
    });
    // ledgerId é opcional (contas de admin não têm); só o userId é obrigatório.
    if (!payload.userId) return null;
    return { userId: payload.userId, ledgerId: payload.ledgerId, iat: payload.iat };
  } catch {
    // Token expirado, adulterado ou assinado com outro segredo.
    return null;
  }
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
