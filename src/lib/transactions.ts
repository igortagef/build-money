import { z } from "zod";
import { splitEvenly } from "./money";

/**
 * Regra central do sistema: um lançamento é sempre igual à soma dos seus
 * rateios. Um lançamento de categoria única é apenas o caso de um rateio só.
 * Manter isso verdadeiro em toda escrita é o que permite que todo relatório
 * agregue a partir de `transaction_splits` sem casos especiais.
 */

export const splitInputSchema = z.object({
  categoryId: z.string().uuid("Selecione uma categoria"),
  costCenterId: z.string().uuid().nullish(),
  amount: z
    .number()
    .int("Valor deve estar em centavos")
    .positive("Cada rateio precisa ter valor maior que zero"),
  description: z.string().trim().max(200).nullish(),
});

export const transactionInputSchema = z
  .object({
    accountId: z.string().uuid("Selecione uma conta"),
    type: z.enum(["income", "expense", "transfer"]),
    status: z.enum(["pending", "cleared", "reconciled"]).default("cleared"),
    amount: z
      .number()
      .int("Valor deve estar em centavos")
      .positive("O valor precisa ser maior que zero"),
    currency: z.enum(["BRL", "USD", "EUR"]),
    exchangeRate: z.number().positive().default(1),
    description: z.string().trim().min(1, "Descreva o lançamento").max(200),
    notes: z.string().trim().max(2000).nullish(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    counterparty: z.string().trim().max(200).nullish(),
    splits: z.array(splitInputSchema).min(1, "Informe ao menos uma categoria"),
  })
  .superRefine((tx, ctx) => {
    const total = tx.splits.reduce((sum, s) => sum + s.amount, 0);
    if (total !== tx.amount) {
      const diff = tx.amount - total;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splits"],
        message:
          diff > 0
            ? `Faltam ${(diff / 100).toFixed(2)} para fechar o valor do lançamento`
            : `O rateio excede o lançamento em ${(-diff / 100).toFixed(2)}`,
      });
    }

    // Duas linhas de rateio na mesma categoria e centro de custo deveriam ser
    // uma só; permitir isso quebra a leitura dos relatórios por categoria.
    const seen = new Set<string>();
    tx.splits.forEach((s, i) => {
      const key = `${s.categoryId}:${s.costCenterId ?? ""}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["splits", i, "categoryId"],
          message: "Categoria repetida no rateio — some os valores em uma linha",
        });
      }
      seen.add(key);
    });
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type SplitInput = z.infer<typeof splitInputSchema>;

/**
 * Redistribui os rateios quando o total do lançamento muda, preservando a
 * proporção de cada categoria. O resto da divisão vai para as primeiras
 * linhas, então a soma continua exata.
 */
export function rebalanceSplits(
  splits: SplitInput[],
  newTotal: number,
): SplitInput[] {
  const oldTotal = splits.reduce((sum, s) => sum + s.amount, 0);

  if (oldTotal === 0) {
    const even = splitEvenly(newTotal, splits.length);
    return splits.map((s, i) => ({ ...s, amount: even[i] }));
  }

  const scaled = splits.map((s) => ({
    ...s,
    amount: Math.floor((s.amount * newTotal) / oldTotal),
  }));

  let remainder = newTotal - scaled.reduce((sum, s) => sum + s.amount, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % scaled.length) {
    scaled[i].amount += 1;
    remainder -= 1;
  }

  return scaled;
}

/** Converte percentuais em centavos, garantindo que a soma feche no total. */
export function splitByPercentage(
  totalCents: number,
  percentages: number[],
): number[] {
  const sum = percentages.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`Percentuais somam ${sum}%, deveriam somar 100%`);
  }

  const amounts = percentages.map((p) =>
    Math.floor((totalCents * p) / 100),
  );

  let remainder = totalCents - amounts.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % amounts.length) {
    amounts[i] += 1;
    remainder -= 1;
  }

  return amounts;
}

/** Sinal contábil do lançamento: despesa reduz o saldo, receita aumenta. */
export function signedAmount(type: string, amount: number): number {
  return type === "expense" ? -amount : amount;
}
