import "server-only";
import { and, eq, gt, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { bankStatementLines, reimbursables, transactions } from "@/db/schema";
import { parseExtrato } from "./import-extrato";

/**
 * Importação do extrato para CONCILIAÇÃO.
 *
 * Diferente do import antigo, aqui nada vira lançamento: as linhas ficam numa
 * área de espera (bank_statement_lines) até o usuário conciliá-las com um
 * lançamento existente ou acatar a criação de um novo.
 */

/** Chave estável da linha, para reimportar o mesmo extrato sem duplicar. */
function chaveDaLinha(data: string, valorAssinado: number, descricao: string): string {
  return `${data}|${valorAssinado}|${descricao.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export async function importarExtratoParaConciliacao(
  ledgerId: string,
  accountId: string,
  texto: string,
  nomeArquivo: string,
): Promise<{ ok: boolean; erro?: string; novas: number; repetidas: number }> {
  const lancamentos = parseExtrato(texto, nomeArquivo);
  if (lancamentos.length === 0) {
    return { ok: false, erro: "Não encontrei lançamentos no arquivo.", novas: 0, repetidas: 0 };
  }

  const valores = lancamentos.map((l) => {
    const assinado = l.tipo === "expense" ? -Math.abs(l.amount) : Math.abs(l.amount);
    return {
      ledgerId,
      accountId,
      date: l.data,
      amount: assinado,
      description: l.descricao,
      fitId: chaveDaLinha(l.data, assinado, l.descricao),
    };
  });

  // O índice único (conta, fit_id) transforma a reimportação em no-op.
  const inseridas = await db
    .insert(bankStatementLines)
    .values(valores)
    .onConflictDoNothing({
      target: [bankStatementLines.accountId, bankStatementLines.fitId],
      where: sql`${bankStatementLines.fitId} is not null`,
    })
    .returning({ id: bankStatementLines.id });

  return {
    ok: true,
    novas: inseridas.length,
    repetidas: valores.length - inseridas.length,
  };
}

export type SugestaoPar = {
  // Um ou mais lançamentos que, juntos, batem com a linha do banco. Um racha
  // pago de uma vez vira DUAS pernas na conta (minha parte + transferência do
  // reembolso), e o banco mostra uma linha só — por isso `ids` pode ter dois.
  ids: string[];
  description: string;
  date: string;
  amount: number; // valor do par, para exibição (positivo)
  confianca: "alta" | "media";
  racha?: boolean;
};

export type LinhaComSugestao = {
  id: string;
  date: string;
  amount: number;
  description: string;
  sugestao: SugestaoPar | null;
};

/** Quanto duas descrições se parecem (0 a 1), por palavras em comum. */
function similaridade(a: string, b: string): number {
  const palavras = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length > 2),
    );
  const A = palavras(a);
  const B = palavras(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comuns = 0;
  for (const p of A) if (B.has(p)) comuns++;
  return comuns / Math.min(A.size, B.size);
}

/**
 * Linhas pendentes com o par sugerido. O critério é valor exato + data próxima
 * (até 3 dias); a descrição parecida eleva a confiança para "alta".
 */
export async function getLinhasPendentes(
  ledgerId: string,
  accountId: string,
): Promise<LinhaComSugestao[]> {
  const linhas = await db
    .select()
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.ledgerId, ledgerId),
        eq(bankStatementLines.accountId, accountId),
        eq(bankStatementLines.status, "pendente"),
      ),
    )
    .orderBy(bankStatementLines.date);

  if (linhas.length === 0) return [];

  const datas = linhas.map((l) => l.date).sort();
  const margem = (iso: string, dias: number) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  // Candidatos: lançamentos da conta na janela, ainda não conciliados.
  const candidatos = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      date: transactions.date,
      amount: transactions.amount,
      type: transactions.type,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        ne(transactions.status, "reconciled"),
        gte(transactions.date, margem(datas[0], -3)),
        lte(transactions.date, margem(datas[datas.length - 1], 3)),
      ),
    );

  // Grupos de racha: um racha pago de uma vez debita o valor cheio na conta,
  // mas o app guarda isso em DUAS pernas (minha parte + transferência do que
  // será reembolsado). O banco mostra uma linha só, do total. Montamos aqui
  // esses grupos para casar a linha do banco com as duas pernas de uma vez.
  const rachas = await db
    .select({
      id: reimbursables.id,
      description: reimbursables.description,
      date: reimbursables.date,
      totalAmount: reimbursables.totalAmount,
    })
    .from(reimbursables)
    .where(
      and(
        eq(reimbursables.ledgerId, ledgerId),
        eq(reimbursables.accountId, accountId),
        gt(reimbursables.myShare, 0), // sem "minha parte" há uma perna só (casa sozinha)
        gte(reimbursables.date, margem(datas[0], -3)),
        lte(reimbursables.date, margem(datas[datas.length - 1], 3)),
      ),
    );

  type Grupo = { ids: string[]; total: number; date: string; description: string };
  const grupos: Grupo[] = [];
  for (const r of rachas) {
    // As duas pernas na conta, pelas descrições que a criação do racha grava.
    const parte = candidatos.find(
      (c) => c.date === r.date && c.type === "expense" && c.description === `${r.description} (minha parte)`,
    );
    const transf = candidatos.find(
      (c) => c.date === r.date && c.type === "transfer" && c.description === `Racha: ${r.description}`,
    );
    if (parte && transf) {
      grupos.push({ ids: [parte.id, transf.id], total: r.totalAmount, date: r.date, description: r.description });
    }
  }

  const usados = new Set<string>();
  const diasEntre = (a: string, b: string) =>
    Math.abs((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000);

  return linhas.map((l) => {
    const alvo = Math.abs(l.amount);
    const semPar = { id: l.id, date: l.date, amount: l.amount, description: l.description, sugestao: null };

    // 1) Grupo de racha: o total bate e nenhuma das pernas foi usada. Preferimos
    //    o grupo porque o débito do banco é exatamente o valor cheio do racha.
    const grupo = grupos.find(
      (g) => g.total === alvo && g.ids.every((id) => !usados.has(id)) && diasEntre(g.date, l.date) <= 3,
    );
    if (grupo) {
      grupo.ids.forEach((id) => usados.add(id));
      return {
        id: l.id,
        date: l.date,
        amount: l.amount,
        description: l.description,
        sugestao: {
          ids: grupo.ids,
          description: `${grupo.description} (racha: minha parte + reembolso)`,
          date: grupo.date,
          amount: grupo.total,
          confianca: diasEntre(grupo.date, l.date) <= 1 ? ("alta" as const) : ("media" as const),
          racha: true,
        },
      };
    }

    // 2) Par único: valor exato + data próxima; descrição parecida eleva a confiança.
    const pares = candidatos
      .filter((c) => !usados.has(c.id) && Math.abs(c.amount) === alvo && diasEntre(c.date, l.date) <= 3)
      .map((c) => ({ c, sim: similaridade(c.description, l.description) }))
      .sort((x, y) => y.sim - x.sim);

    const melhor = pares[0];
    if (!melhor) return semPar;

    usados.add(melhor.c.id);
    return {
      id: l.id,
      date: l.date,
      amount: l.amount,
      description: l.description,
      sugestao: {
        ids: [melhor.c.id],
        description: melhor.c.description,
        date: melhor.c.date,
        amount: Math.abs(melhor.c.amount),
        confianca: melhor.sim >= 0.34 ? ("alta" as const) : ("media" as const),
      },
    };
  });
}
