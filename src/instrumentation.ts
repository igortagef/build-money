import type { Instrumentation } from "next";

/**
 * Captura central de erros de servidor (renderização, route handlers, server
 * actions). Escreve no banco para o admin ver, sem depender do log da máquina.
 *
 * Só roda no runtime Node (o driver do banco usa WebSocket). O import do módulo
 * de banco é dinâmico para não entrar no bundle do Edge.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { registrarErro } = await import("./lib/error-log");
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    const digest =
      typeof err === "object" && err !== null && "digest" in err
        ? String((err as { digest: unknown }).digest)
        : null;

    await registrarErro({
      message,
      stack,
      digest,
      path: request.path,
      method: request.method,
      routeType: context.routeType,
    });
  } catch {
    // Nunca deixa a captura de erro virar um novo erro.
  }
};
