/** Rodar: npx tsx scripts/check-parcelas.ts */
import { gerarParcelas } from "../src/lib/installments";

let f = 0;
function check(label: string, atual: unknown, esperado: unknown) {
  const ok = JSON.stringify(atual) === JSON.stringify(esperado);
  if (!ok) f++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${label}` +
      (ok ? "" : `\n        esperado ${JSON.stringify(esperado)}\n        obtido   ${JSON.stringify(atual)}`),
  );
}

const corrente = { type: "checking", statementClosingDay: null, paymentDueDay: null };
const cartao = { type: "credit_card", statementClosingDay: 28, paymentDueDay: 5 };

console.log("\n--- soma das parcelas fecha com o total (sem perder centavo) ---");
const p3 = gerarParcelas(10000, 3, "2026-07-10", corrente);
check("R$ 100 em 3: valores", p3.map((p) => p.valor), [3334, 3333, 3333]);
check("soma bate", p3.reduce((s, p) => s + p.valor, 0), 10000);

const p12 = gerarParcelas(120000, 12, "2026-07-10", corrente);
check("R$ 1.200 em 12x = R$ 100 cada", p12.every((p) => p.valor === 10000), true);
check("soma de 12x bate", p12.reduce((s, p) => s + p.valor, 0), 120000);

console.log("\n--- parcelas caem em meses consecutivos ---");
check(
  "datas mensais a partir da primeira",
  p3.map((p) => p.data),
  ["2026-07-10", "2026-08-10", "2026-09-10"],
);
check("numeração 1..N", p3.map((p) => p.numero), [1, 2, 3]);

console.log("\n--- boleto/corrente: competência = caixa ---");
check(
  "sem cartão, a parcela sai no próprio vencimento",
  p3.every((p) => p.data === p.dataCaixa),
  true,
);

console.log("\n--- cartão: caixa segue o vencimento da fatura ---");
const cart = gerarParcelas(30000, 3, "2026-07-20", cartao);
check(
  "competência distribuída por mês",
  cart.map((p) => p.data),
  ["2026-07-20", "2026-08-20", "2026-09-20"],
);
check(
  "caixa cai no vencimento da fatura de cada mês",
  cart.map((p) => p.dataCaixa),
  ["2026-08-05", "2026-09-05", "2026-10-05"],
);

console.log("\n--- vencimento dia 31 corta em meses curtos ---");
const p31 = gerarParcelas(30000, 3, "2026-01-31", corrente);
check(
  "jan 31 -> fev 28 -> mar 31",
  p31.map((p) => p.data),
  ["2026-01-31", "2026-02-28", "2026-03-31"],
);

console.log("\n--- parcela única = à vista ---");
const p1 = gerarParcelas(5000, 1, "2026-07-10", corrente);
check("1 parcela com o total", p1, [
  { numero: 1, data: "2026-07-10", dataCaixa: "2026-07-10", valor: 5000 },
]);

console.log("\n--- vira o ano ---");
const pv = gerarParcelas(20000, 2, "2026-12-15", corrente);
check("dez -> jan do ano seguinte", pv.map((p) => p.data), ["2026-12-15", "2027-01-15"]);

console.log(f === 0 ? "\nTudo passou.\n" : `\n${f} falharam.\n`);
process.exit(f === 0 ? 0 : 1);
