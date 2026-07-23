"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bankStatementLines, transactions, transactionSplits } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { importarExtratoParaConciliacao } from "@/lib/conciliacao-ofx";

export type ImportState = { ok?: boolean; erro?: string; msg?: string };

/** Importa o OFX/CSV para a área de espera — NÃO cria lançamento. */
export async function importarExtrato(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const texto = String(formData.get("texto") ?? "");
  const nomeArquivo = String(formData.get("nomeArquivo") ?? "");
  if (!accountId || !texto) return { erro: "Escolha um arquivo de extrato." };

  const r = await importarExtratoParaConciliacao(ledgerId, accountId, texto, nomeArquivo);
  if (!r.ok) return { erro: r.erro };

  revalidatePath(`/conciliacao/${accountId}`);
  return {
    ok: true,
    msg:
      r.novas === 0
        ? "Nenhuma linha nova — esse extrato já tinha sido importado."
        : `${r.novas} linha(s) importada(s)${r.repetidas > 0 ? ` · ${r.repetidas} já existiam` : ""}.`,
  };
}

/**
 * Casa a linha do banco com um ou mais lançamentos e marca todos como
 * conferidos. Normalmente é um só; num racha pago de uma vez são dois (minha
 * parte + transferência do reembolso), que juntos batem com a linha do banco.
 */
export async function conciliarLinha(formData: FormData): Promise<void> {
  const { ledgerId } = await requireWriteAccess();
  const linhaId = String(formData.get("linhaId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const ids = String(formData.get("transactionIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!linhaId || ids.length === 0) return;

  await db.transaction(async (trx) => {
    await trx
      .update(transactions)
      .set({ status: "reconciled", reconciledAt: new Date() })
      .where(and(inArray(transactions.id, ids), eq(transactions.ledgerId, ledgerId)));
    await trx
      .update(bankStatementLines)
      .set({ status: "conciliada", transactionId: ids[0] })
      .where(and(eq(bankStatementLines.id, linhaId), eq(bankStatementLines.ledgerId, ledgerId)));
  });

  revalidatePath(`/conciliacao/${accountId}`);
  revalidatePath("/conciliacao");
}

/** Tira a linha da fila sem criar nada (duplicata, transferência interna…). */
export async function arquivarLinha(formData: FormData): Promise<void> {
  const { ledgerId } = await requireWriteAccess();
  const linhaId = String(formData.get("linhaId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  await db
    .update(bankStatementLines)
    .set({ status: "arquivada" })
    .where(and(eq(bankStatementLines.id, linhaId), eq(bankStatementLines.ledgerId, ledgerId)));
  revalidatePath(`/conciliacao/${accountId}`);
  revalidatePath("/conciliacao");
}

/**
 * Cria o lançamento a partir da linha do banco e já o concilia. É o caminho
 * quando não existe par — o formulário chega pré-preenchido (categoria vem das
 * regras), mas só grava quando o usuário acata.
 */
export async function criarEConciliar(formData: FormData): Promise<void> {
  const { ledgerId, userId } = await requireWriteAccess();
  const linhaId = String(formData.get("linhaId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!linhaId || !descricao) return;

  const [linha] = await db
    .select()
    .from(bankStatementLines)
    .where(and(eq(bankStatementLines.id, linhaId), eq(bankStatementLines.ledgerId, ledgerId)))
    .limit(1);
  if (!linha || linha.status !== "pendente") return;

  const valor = Math.abs(linha.amount);
  const tipo = linha.amount < 0 ? "expense" : "income";

  await db.transaction(async (trx) => {
    const [tx] = await trx
      .insert(transactions)
      .values({
        ledgerId,
        accountId: linha.accountId,
        createdByUserId: userId,
        type: tipo,
        // Nasce já conferido: veio do extrato e o usuário acabou de acatar.
        status: "reconciled",
        reconciledAt: new Date(),
        amount: valor,
        currency: "BRL",
        amountBase: valor,
        description: descricao,
        date: linha.date,
      })
      .returning({ id: transactions.id });

    if (categoryId) {
      await trx.insert(transactionSplits).values({
        transactionId: tx.id,
        categoryId,
        amount: valor,
        amountBase: valor,
        sortOrder: 0,
      });
    }

    await trx
      .update(bankStatementLines)
      .set({ status: "conciliada", transactionId: tx.id })
      .where(eq(bankStatementLines.id, linhaId));
  });

  revalidatePath(`/conciliacao/${accountId}`);
  revalidatePath("/conciliacao");
  revalidatePath("/lancamentos");
}
