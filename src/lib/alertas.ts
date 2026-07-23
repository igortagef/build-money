import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, creditCardStatements } from "@/db/schema";
import type { CurrencyCode } from "@/db/schema";
import { formatMoney } from "./money";
import { getVencimentos } from "./queries";
import { getOrcamentoDoMes } from "./budgets";
import { getFluxoProjetado } from "./reports";
import { getMetasComProgresso } from "./goals";

/**
 * Central de alertas: o que precisa de atenção, calculado a partir dos dados
 * que o app já tem (vencimentos, faturas, orçamento, fluxo projetado, metas).
 * É a base tanto da superfície no app (sino no cabeçalho) quanto de um futuro
 * envio por e-mail/push — a lógica de "o que alertar" mora aqui, num lugar só.
 */
export type SeveridadeAlerta = "danger" | "warning" | "info" | "success";
export type CategoriaAlerta = "lancamento" | "cartao" | "orcamento" | "fluxo" | "meta";

export type Alerta = {
  id: string;
  categoria: CategoriaAlerta;
  severidade: SeveridadeAlerta;
  titulo: string;
  descricao: string;
  href: string;
};

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dCurta = (iso: string) => DATA_CURTA.format(new Date(`${iso}T12:00:00`));

const ORDEM: Record<SeveridadeAlerta, number> = { danger: 0, warning: 1, info: 2, success: 3 };

export async function getAlertas(ledgerId: string, currency: CurrencyCode): Promise<Alerta[]> {
  const [venc, orc, fluxo, metas, faturas] = await Promise.all([
    getVencimentos(ledgerId),
    getOrcamentoDoMes(ledgerId, new Date(), "competencia"),
    getFluxoProjetado(ledgerId, 6),
    getMetasComProgresso(ledgerId),
    db
      .select({
        id: creditCardStatements.id,
        accountId: creditCardStatements.accountId,
        nome: accounts.name,
        total: creditCardStatements.totalAmount,
        dueDate: creditCardStatements.dueDate,
      })
      .from(creditCardStatements)
      .innerJoin(accounts, eq(accounts.id, creditCardStatements.accountId))
      .where(
        and(
          eq(creditCardStatements.ledgerId, ledgerId),
          eq(creditCardStatements.status, "closed"),
        ),
      )
      .orderBy(desc(creditCardStatements.dueDate)),
  ]);

  const alertas: Alerta[] = [];
  const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

  // --- Lançamentos previstos ---
  if (venc.vencidas.length > 0) {
    alertas.push({
      id: "venc-vencidas",
      categoria: "lancamento",
      severidade: "danger",
      titulo: `${venc.vencidas.length} ${plural(venc.vencidas.length, "lançamento vencido", "lançamentos vencidos")}`,
      descricao: venc.totalVencido > 0 ? `${formatMoney(venc.totalVencido, currency)} em atraso` : "Precisam de baixa",
      href: "/lancamentos",
    });
  }
  if (venc.aVencer.length > 0) {
    alertas.push({
      id: "venc-avencer",
      categoria: "lancamento",
      severidade: "warning",
      titulo: `${venc.aVencer.length} ${plural(venc.aVencer.length, "conta a vencer", "contas a vencer")}`,
      descricao: `${formatMoney(venc.totalAVencer, currency)} nos próximos dias`,
      href: "/lancamentos",
    });
  }

  // --- Faturas de cartão fechadas a pagar ---
  for (const f of faturas) {
    alertas.push({
      id: `fatura-${f.id}`,
      categoria: "cartao",
      severidade: "warning",
      titulo: `Fatura ${f.nome} fechada`,
      descricao: `${formatMoney(f.total, currency)} · vence ${dCurta(f.dueDate)}`,
      href: `/cartoes/${f.accountId}`,
    });
  }

  // --- Orçamento ---
  if (orc.estourouAlguma) {
    alertas.push({
      id: "orc-estourou",
      categoria: "orcamento",
      severidade: "danger",
      titulo: "Orçamento estourado",
      descricao: "Alguma categoria passou do limite deste mês.",
      href: "/orcamento",
    });
  } else if (orc.totalOrcado > 0 && orc.percentualTotal >= 80) {
    alertas.push({
      id: "orc-quase",
      categoria: "orcamento",
      severidade: "warning",
      titulo: "Orçamento quase no limite",
      descricao: `Você já usou ${orc.percentualTotal}% do previsto para o mês.`,
      href: "/orcamento",
    });
  }

  // --- Fluxo de caixa projetado ---
  if (fluxo.mesNegativo) {
    alertas.push({
      id: "fluxo-negativo",
      categoria: "fluxo",
      severidade: "danger",
      titulo: "Saldo pode ficar negativo",
      descricao: `A projeção aponta caixa negativo em ${fluxo.mesNegativo.rotulo} (${formatMoney(fluxo.mesNegativo.saldoProjetado, currency)}).`,
      href: "/relatorios/fluxo",
    });
  }

  // --- Metas atingidas ---
  for (const m of metas) {
    if (m.atingida && m.status === "active") {
      alertas.push({
        id: `meta-${m.id}`,
        categoria: "meta",
        severidade: "success",
        titulo: `Meta "${m.name}" atingida!`,
        descricao: "Parabéns — hora de comemorar ou definir a próxima.",
        href: "/metas",
      });
    }
  }

  alertas.sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
  return alertas;
}
