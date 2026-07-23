"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { aoCadastrarConta, semQuebrar } from "@/lib/gamification";
import { BANCOS } from "@/lib/banks";

export type AccountFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const accountSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome à conta").max(80),
    type: z.enum(["checking", "savings", "credit_card", "cash", "investment"], {
      message: "Selecione o tipo",
    }),
    currency: z.enum(["BRL", "USD", "EUR"]),
    institution: z.string().trim().max(80).optional(),
    openingBalance: z.number().int(),
    creditLimit: z.number().int().nonnegative().nullable(),
    statementClosingDay: z.number().int().min(1).max(31).nullable(),
    paymentDueDay: z.number().int().min(1).max(31).nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "credit_card") return;
    if (data.statementClosingDay === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["statementClosingDay"],
        message: "Informe o dia do fechamento da fatura",
      });
    }
    if (data.paymentDueDay === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentDueDay"],
        message: "Informe o dia do vencimento",
      });
    }
  });

function optionalInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export async function createAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  // Server Actions são endpoints POST públicos — a checagem vem antes de tudo.
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    institution: String(formData.get("institution") ?? "").trim() || undefined,
    openingBalance: parseMoney(String(formData.get("openingBalance") ?? "")) ?? 0,
    creditLimit: parseMoney(String(formData.get("creditLimit") ?? "")),
    statementClosingDay: optionalInt(formData.get("statementClosingDay")),
    paymentDueDay: optionalInt(formData.get("paymentDueDay")),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const data = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

  // Banco escolhido (guardado em `icon`) e sua cor de marca (em `color`). Só
  // aceita ids do catálogo, para não guardar valor arbitrário.
  const bankRaw = String(formData.get("bank") ?? "");
  const bancoId = BANCOS.some((b) => b.id === bankRaw) ? bankRaw : null;
  const corRaw = String(formData.get("color") ?? "").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(corRaw) ? corRaw : null;

  await db.insert(accounts).values({
    ledgerId,
    name: data.name,
    type: data.type,
    currency: data.currency,
    institution: data.institution ?? null,
    openingBalance: data.openingBalance,
    openingBalanceDate: today,
    creditLimit: data.type === "credit_card" ? data.creditLimit : null,
    statementClosingDay:
      data.type === "credit_card" ? data.statementClosingDay : null,
    paymentDueDay: data.type === "credit_card" ? data.paymentDueDay : null,
    icon: bancoId,
    color,
  });

  await semQuebrar(() => aoCadastrarConta(userId, ledgerId));

  revalidatePath("/contas");
  revalidatePath("/conquistas");
  revalidatePath("/");
  redirect("/contas");
}
