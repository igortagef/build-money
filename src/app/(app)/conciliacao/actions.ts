"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { registrarSaldoBanco } from "@/lib/saldo-banco";

/**
 * Confere de uma vez todos os lançamentos realizados de um dia — o movimento
 * natural de quem compara o saldo de fechamento do dia com o extrato e confirma.
 */
export async function conferirDia(formData: FormData): Promise<void> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const data = String(formData.get("data") ?? "");
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;

  await db
    .update(transactions)
    .set({ status: "reconciled", reconciledAt: new Date() })
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        eq(transactions.date, data),
        eq(transactions.status, "cleared"),
      ),
    );

  revalidatePath(`/conciliacao/${accountId}`);
  revalidatePath("/conciliacao");
  revalidatePath("/");
}

export type SaldoBancoState = { ok?: boolean; erro?: string };

/**
 * Registra o saldo que o extrato do banco mostra numa data. A tela então
 * compara com o saldo do app até ali e revela a diferença — o alvo é zero.
 */
export async function conferirSaldoBanco(
  _prev: SaldoBancoState,
  formData: FormData,
): Promise<SaldoBancoState> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const data = String(formData.get("data") ?? "");
  const balance = parseMoney(String(formData.get("saldo") ?? ""));

  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: "Informe uma data válida." };
  }
  if (balance === null) {
    return { erro: "Informe o saldo do extrato (ex.: 1.234,56)." };
  }

  const r = await registrarSaldoBanco(ledgerId, accountId, data, balance);
  if (!r.ok) return { erro: r.erro };

  revalidatePath(`/conciliacao/${accountId}`);
  revalidatePath("/conciliacao");
  return { ok: true };
}

/** Desfaz a conferência do dia (voltar atrás sem sair da tela). */
export async function desconferirDia(formData: FormData): Promise<void> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const data = String(formData.get("data") ?? "");
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;

  await db
    .update(transactions)
    .set({ status: "cleared", reconciledAt: null })
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        eq(transactions.date, data),
        eq(transactions.status, "reconciled"),
      ),
    );

  revalidatePath(`/conciliacao/${accountId}`);
  revalidatePath("/conciliacao");
  revalidatePath("/");
}
