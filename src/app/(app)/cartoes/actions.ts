"use server";

import { revalidatePath } from "next/cache";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import {
  alternarFaturaPaga,
  fecharFatura,
  reparcelarFatura,
} from "@/lib/faturas-ops";

export type AcaoFaturaState = { ok?: boolean; erro?: string };

function revalidarCartao(accountId: string) {
  revalidatePath(`/cartoes/${accountId}`);
  revalidatePath("/cartoes");
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

export async function acaoFecharFatura(
  _prev: AcaoFaturaState,
  formData: FormData,
): Promise<AcaoFaturaState> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const r = await fecharFatura(ledgerId, accountId, dueDate);
  if (r.ok) revalidarCartao(accountId);
  return r;
}

export async function acaoAlternarPaga(
  _prev: AcaoFaturaState,
  formData: FormData,
): Promise<AcaoFaturaState> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const statementId = String(formData.get("statementId") ?? "");
  const r = await alternarFaturaPaga(ledgerId, statementId);
  if (r.ok) revalidarCartao(accountId);
  return r;
}

export async function acaoReparcelar(
  _prev: AcaoFaturaState,
  formData: FormData,
): Promise<AcaoFaturaState> {
  const { ledgerId } = await requireWriteAccess();
  const accountId = String(formData.get("accountId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const parcelas = Number(formData.get("parcelas") ?? 0);
  const juros = parseMoney(String(formData.get("juros") ?? "")) ?? 0;
  const r = await reparcelarFatura(ledgerId, accountId, dueDate, {
    parcelas,
    jurosCentavos: juros,
  });
  if (r.ok) revalidarCartao(accountId);
  return r;
}
