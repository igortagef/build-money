"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  accounts,
  categories,
  reimbursables,
  reimbursableParticipants,
  transactions,
  transactionSplits,
} from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { calcularDataDeCaixa } from "@/lib/statement";

export type RachaState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Encontra (ou cria) a conta-piscina de rachas do espaço. */
async function garantirPiscina(
  trx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ledgerId: string,
  currency: "BRL" | "USD" | "EUR",
) {
  const [existente] = await trx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.isReimbursementPool, true)))
    .limit(1);
  if (existente) return existente.id;

  const [criada] = await trx
    .insert(accounts)
    .values({
      ledgerId,
      name: "Valores a reembolsar",
      type: "cash",
      currency,
      openingBalance: 0,
      openingBalanceDate: new Date().toISOString().slice(0, 10),
      isReimbursementPool: true,
      includeInNetWorth: false,
    })
    .returning({ id: accounts.id });
  return criada.id;
}

async function transferir(
  trx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ledgerId: string,
  userId: string,
  fromId: string,
  toId: string,
  amount: number,
  currency: "BRL" | "USD" | "EUR",
  date: string,
  descricao: string,
) {
  const par = crypto.randomUUID();
  await trx.insert(transactions).values([
    {
      ledgerId, accountId: fromId, createdByUserId: userId, type: "transfer",
      status: "cleared", amount: -amount, currency, amountBase: -amount,
      description: descricao, date, settlementDate: date, transferPairId: par,
    },
    {
      ledgerId, accountId: toId, createdByUserId: userId, type: "transfer",
      status: "cleared", amount, currency, amountBase: amount,
      description: descricao, date, settlementDate: date, transferPairId: par,
    },
  ]);
}

const participanteSchema = z.object({
  nome: z.string().trim().max(120),
  valor: z.number().int().nonnegative(),
});

const criarSchema = z
  .object({
    description: z.string().trim().min(1, "Descreva o racha").max(200),
    accountId: z.string().uuid("Selecione a conta que pagou"),
    total: z.number().int().positive("O valor total precisa ser maior que zero"),
    myShare: z.number().int().nonnegative(),
    // Categoria só é exigida quando há parte minha (despesa) a lançar.
    categoryId: z.string().uuid().nullable(),
    participantes: z
      .array(participanteSchema)
      .min(1, "Ao menos uma pessoa reembolsa")
      .max(50),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  })
  .superRefine((d, ctx) => {
    if (d.myShare > d.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["myShare"],
        message: "Sua parte não pode ser maior que o total",
      });
    }
    if (d.myShare > 0 && !d.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "Escolha a categoria da sua parte (vira despesa)",
      });
    }
    const aReembolsar = d.total - d.myShare;
    if (aReembolsar <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["myShare"],
        message: "Se você paga tudo, não há o que reembolsar — use um lançamento comum",
      });
    }
    // A soma das cotas individuais precisa fechar com o que será reembolsado —
    // senão o saldo da piscina não bateria com o rastreio dos participantes.
    const somaCotas = d.participantes.reduce((s, p) => s + p.valor, 0);
    if (aReembolsar > 0 && somaCotas !== aReembolsar) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantes"],
        message: `A soma das partes (${(somaCotas / 100).toFixed(2)}) precisa ser igual ao que será reembolsado (${(aReembolsar / 100).toFixed(2)}).`,
      });
    }
  });

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export async function createReimbursable(
  _prev: RachaState,
  formData: FormData,
): Promise<RachaState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const pessoas = Number(formData.get("pessoas") ?? 0);
  const participantes: { nome: string; valor: number }[] = [];
  for (let i = 0; i < pessoas; i++) {
    participantes.push({
      nome: String(formData.get(`nome_${i}`) ?? "").trim(),
      valor: parseMoney(String(formData.get(`valor_${i}`) ?? "")) ?? 0,
    });
  }

  const parsed = criarSchema.safeParse({
    description: formData.get("description"),
    accountId: formData.get("accountId"),
    total: parseMoney(String(formData.get("total") ?? "")) ?? 0,
    myShare: parseMoney(String(formData.get("myShare") ?? "")) ?? 0,
    categoryId: String(formData.get("categoryId") ?? "") || null,
    participantes,
    date: String(formData.get("date") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const [conta] = await db
    .select({
      id: accounts.id, currency: accounts.currency, type: accounts.type,
      statementClosingDay: accounts.statementClosingDay, paymentDueDay: accounts.paymentDueDay,
    })
    .from(accounts)
    .where(and(eq(accounts.id, d.accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return { fieldErrors: { accountId: "Conta inválida" } };

  // Valida a categoria da despesa (minha parte), se houver.
  if (d.myShare > 0 && d.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, d.categoryId),
          eq(categories.ledgerId, ledgerId),
          eq(categories.type, "expense"),
        ),
      )
      .limit(1);
    if (!cat) return { fieldErrors: { categoryId: "Categoria inválida" } };
  }

  const aReembolsar = d.total - d.myShare;

  await db.transaction(async (trx) => {
    const poolId = await garantirPiscina(trx, ledgerId, conta.currency);

    const [racha] = await trx
      .insert(reimbursables)
      .values({
        ledgerId,
        description: d.description,
        totalAmount: d.total,
        myShare: d.myShare,
        amount: aReembolsar,
        accountId: d.accountId,
        currency: conta.currency,
        status: "open",
        date: d.date,
      })
      .returning({ id: reimbursables.id });

    // Participantes com as cotas informadas (a soma já foi validada).
    await trx.insert(reimbursableParticipants).values(
      d.participantes.map((p, i) => ({
        reimbursableId: racha.id,
        name: p.nome || `Pessoa ${i + 1}`,
        amount: p.valor,
        sortOrder: i,
      })),
    );

    // Minha parte vira DESPESA de verdade (na categoria escolhida): esse
    // dinheiro é meu gasto, não volta.
    if (d.myShare > 0 && d.categoryId) {
      const [tx] = await trx
        .insert(transactions)
        .values({
          ledgerId,
          accountId: d.accountId,
          createdByUserId: userId,
          type: "expense",
          status: "cleared",
          amount: d.myShare,
          currency: conta.currency,
          amountBase: d.myShare,
          description: `${d.description} (minha parte)`,
          date: d.date,
          settlementDate: calcularDataDeCaixa(d.date, conta),
        })
        .returning({ id: transactions.id });
      await trx.insert(transactionSplits).values({
        transactionId: tx.id,
        categoryId: d.categoryId,
        amount: d.myShare,
        amountBase: d.myShare,
        sortOrder: 0,
      });
    }

    // O que será reembolsado sai da conta para a piscina (não é despesa).
    if (aReembolsar > 0) {
      await transferir(
        trx, ledgerId, userId, d.accountId, poolId, aReembolsar,
        conta.currency, d.date, `Racha: ${d.description}`,
      );
    }
  });

  revalidatePath("/rachas");
  revalidatePath("/");
  redirect("/rachas");
}

/** Marca um participante como pago (ou desfaz), movendo o dinheiro de volta. */
export async function togglePaid(formData: FormData) {
  const { ledgerId, userId } = await requireWriteAccess();
  const participantId = String(formData.get("participantId") ?? "");

  const [p] = await db
    .select({
      id: reimbursableParticipants.id,
      amount: reimbursableParticipants.amount,
      paidAt: reimbursableParticipants.paidAt,
      rachaId: reimbursableParticipants.reimbursableId,
    })
    .from(reimbursableParticipants)
    .where(eq(reimbursableParticipants.id, participantId))
    .limit(1);
  if (!p) return;

  const [racha] = await db
    .select()
    .from(reimbursables)
    .where(and(eq(reimbursables.id, p.rachaId), eq(reimbursables.ledgerId, ledgerId)))
    .limit(1);
  if (!racha) return;

  const pagando = !p.paidAt;
  const hoje = new Date().toISOString().slice(0, 10);

  await db.transaction(async (trx) => {
    const poolId = await garantirPiscina(trx, ledgerId, racha.currency);

    if (pagando) {
      // Recebeu: dinheiro volta da piscina para a conta original.
      await transferir(
        trx, ledgerId, userId, poolId, racha.accountId, p.amount,
        racha.currency, hoje, `Reembolso: ${racha.description}`,
      );
    } else {
      // Desfaz: dinheiro volta para a piscina.
      await transferir(
        trx, ledgerId, userId, racha.accountId, poolId, p.amount,
        racha.currency, hoje, `Reembolso: ${racha.description}`,
      );
    }

    await trx
      .update(reimbursableParticipants)
      .set({ paidAt: pagando ? new Date() : null })
      .where(eq(reimbursableParticipants.id, participantId));

    // Recalcula o total recebido e o status do racha a partir dos participantes.
    const parts = await trx
      .select({ amount: reimbursableParticipants.amount, paidAt: reimbursableParticipants.paidAt })
      .from(reimbursableParticipants)
      .where(eq(reimbursableParticipants.reimbursableId, p.rachaId));
    const recebido = parts.filter((x) => x.paidAt).reduce((s, x) => s + x.amount, 0);
    const todosPagos = parts.every((x) => x.paidAt);

    await trx
      .update(reimbursables)
      .set({ settledAmount: recebido, status: todosPagos ? "settled" : "open" })
      .where(eq(reimbursables.id, p.rachaId));
  });

  revalidatePath("/rachas");
  revalidatePath("/");
}

/** Apaga um racha e tudo ligado a ele (despesa da minha parte + transferências). */
export async function deleteReimbursable(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  const [racha] = await db
    .select()
    .from(reimbursables)
    .where(and(eq(reimbursables.id, id), eq(reimbursables.ledgerId, ledgerId)))
    .limit(1);
  if (!racha) return;

  await db.transaction(async (trx) => {
    for (const desc of [
      `Racha: ${racha.description}`,
      `Reembolso: ${racha.description}`,
      `${racha.description} (minha parte)`,
    ]) {
      await trx
        .delete(transactions)
        .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.description, desc)));
    }
    // Participantes somem por cascade ao apagar o racha.
    await trx.delete(reimbursables).where(eq(reimbursables.id, id));
  });

  revalidatePath("/rachas");
  revalidatePath("/");
}
