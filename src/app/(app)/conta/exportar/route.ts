import { requireContaAccess } from "@/lib/auth";
import { exportarDados } from "@/lib/meus-dados";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * Baixa TODOS os dados do usuário em JSON (portabilidade, LGPD art. 18). Não
 * inclui senha nem segredos de segurança.
 */
export async function GET() {
  const { userId } = await requireContaAccess();
  const dados = await exportarDados(userId);
  await registrarAuditoria({ userId, action: "data_exported" });

  const hoje = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(dados, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="build-money-meus-dados-${hoje}.json"`,
    },
  });
}
