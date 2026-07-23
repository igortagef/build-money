/**
 * Conferência rápida das funções de dinheiro e rateio.
 * Rodar: npx tsx scripts/check-core.ts
 */
import { parseMoney, formatMoney, splitEvenly } from "../src/lib/money";
import {
  rebalanceSplits,
  splitByPercentage,
  transactionInputSchema,
} from "../src/lib/transactions";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${label}\n      esperado ${JSON.stringify(expected)} | obtido ${JSON.stringify(actual)}`,
  );
}

console.log("\n--- parseMoney ---");
check("1.234,56 (pt-BR)", parseMoney("1.234,56"), 123456);
check("1234.56 (en-US)", parseMoney("1234.56"), 123456);
check("1234,56", parseMoney("1234,56"), 123456);
check("R$ 1.234,56", parseMoney("R$ 1.234,56"), 123456);
check("1,234.56", parseMoney("1,234.56"), 123456);
check("1.234 (milhar)", parseMoney("1.234"), 123400);
check("50", parseMoney("50"), 5000);
check("0,05", parseMoney("0,05"), 5);
check("-89,90", parseMoney("-89,90"), -8990);
check("vazio", parseMoney(""), null);
check("lixo", parseMoney("abc"), null);

console.log("\n--- splitEvenly (sem perder centavos) ---");
check("100,00 em 3", splitEvenly(10000, 3), [3334, 3333, 3333]);
check("soma bate", splitEvenly(10000, 3).reduce((a, b) => a + b, 0), 10000);
check("0,01 em 3", splitEvenly(1, 3), [1, 0, 0]);
check("negativo", splitEvenly(-10000, 3), [-3334, -3333, -3333]);

console.log("\n--- splitByPercentage ---");
check("70/30 de 100,00", splitByPercentage(10000, [70, 30]), [7000, 3000]);
const thirds = splitByPercentage(10000, [33.34, 33.33, 33.33]);
check("terços somam o total", thirds.reduce((a, b) => a + b, 0), 10000);

console.log("\n--- rebalanceSplits ---");
const base = [
  { categoryId: "a", amount: 7000 },
  { categoryId: "b", amount: 3000 },
] as any;
const rebalanced = rebalanceSplits(base, 20000);
check("proporção mantida", rebalanced.map((s: any) => s.amount), [14000, 6000]);
const odd = rebalanceSplits(base, 10001);
check("soma exata com resto", odd.reduce((s: any, x: any) => s + x.amount, 0), 10001);

console.log("\n--- validação de rateio ---");
const valid = transactionInputSchema.safeParse({
  accountId: "11111111-1111-4111-8111-111111111111",
  type: "expense",
  amount: 10000,
  currency: "BRL",
  description: "Mercado",
  date: "2026-07-16",
  splits: [
    { categoryId: "22222222-2222-4222-8222-222222222222", amount: 7000 },
    { categoryId: "33333333-3333-4333-8333-333333333333", amount: 3000 },
  ],
});
check("rateio que fecha é aceito", valid.success, true);

const invalid = transactionInputSchema.safeParse({
  accountId: "11111111-1111-4111-8111-111111111111",
  type: "expense",
  amount: 10000,
  currency: "BRL",
  description: "Mercado",
  date: "2026-07-16",
  splits: [
    { categoryId: "22222222-2222-4222-8222-222222222222", amount: 7000 },
  ],
});
check("rateio que não fecha é rejeitado", invalid.success, false);
if (!invalid.success) {
  console.log("      mensagem:", invalid.error.issues[0].message);
}

const dup = transactionInputSchema.safeParse({
  accountId: "11111111-1111-4111-8111-111111111111",
  type: "expense",
  amount: 10000,
  currency: "BRL",
  description: "Mercado",
  date: "2026-07-16",
  splits: [
    { categoryId: "22222222-2222-4222-8222-222222222222", amount: 5000 },
    { categoryId: "22222222-2222-4222-8222-222222222222", amount: 5000 },
  ],
});
check("categoria repetida é rejeitada", dup.success, false);

console.log("\n--- formatMoney ---");
console.log("      BRL:", formatMoney(123456, "BRL"));
console.log("      USD:", formatMoney(123456, "USD"));
console.log("      EUR:", formatMoney(123456, "EUR"));
console.log("      negativo:", formatMoney(-123456, "BRL"));

console.log(
  failures === 0
    ? "\nTudo passou.\n"
    : `\n${failures} verificação(ões) falharam.\n`,
);
process.exit(failures === 0 ? 0 : 1);
