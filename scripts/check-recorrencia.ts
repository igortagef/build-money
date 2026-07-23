/** Rodar: npx tsx scripts/check-recorrencia.ts */
import {
  ocorrencias,
  primeiraOcorrencia,
  proximaOcorrencia,
  somarMeses,
  somarDias,
  type Regra,
} from "../src/lib/recurrence";

let f = 0;
function check(label: string, atual: unknown, esperado: unknown) {
  const ok = JSON.stringify(atual) === JSON.stringify(esperado);
  if (!ok) f++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${label}` +
      (ok ? "" : `\n        esperado ${JSON.stringify(esperado)}\n        obtido   ${JSON.stringify(atual)}`),
  );
}

const mensal = (dia: number, inicio: string, fim: string | null = null): Regra => ({
  frequency: "monthly",
  dayOfMonth: dia,
  startDate: inicio,
  endDate: fim,
});

console.log("\n--- somarDias (sem passar por fuso) ---");
check("31/12 + 1 = 01/01", somarDias("2026-12-31", 1), "2027-01-01");
check("28/02 + 1 (não bissexto)", somarDias("2026-02-28", 1), "2026-03-01");
check("28/02 + 1 (bissexto 2028)", somarDias("2028-02-28", 1), "2028-02-29");

console.log("\n--- somarMeses mantendo o dia do vencimento ---");
check("31/01 + 1 mês = 28/02", somarMeses("2026-01-31", 1, 31), "2026-02-28");
check("31/01 + 1 mês em bissexto = 29/02", somarMeses("2028-01-31", 1, 31), "2028-02-29");
check("31/03 + 1 mês = 30/04", somarMeses("2026-03-31", 1, 31), "2026-04-30");
check("15/12 + 1 mês vira ano novo", somarMeses("2026-12-15", 1, 15), "2027-01-15");
check("15/01 + 12 meses", somarMeses("2026-01-15", 12, 15), "2027-01-15");

console.log("\n--- primeira ocorrência ---");
check(
  "início dia 5, vence dia 10 -> mesmo mês",
  primeiraOcorrencia(mensal(10, "2026-07-05")),
  "2026-07-10",
);
check(
  "início dia 20, vence dia 10 -> só mês que vem (não cobra retroativo)",
  primeiraOcorrencia(mensal(10, "2026-07-20")),
  "2026-08-10",
);
check(
  "início no próprio dia do vencimento -> conta hoje",
  primeiraOcorrencia(mensal(10, "2026-07-10")),
  "2026-07-10",
);
check(
  "vence dia 31, início em fevereiro -> último dia de fevereiro",
  primeiraOcorrencia(mensal(31, "2026-02-01")),
  "2026-02-28",
);

console.log("\n--- o dia 31 volta depois de um mês curto ---");
const d31 = mensal(31, "2026-01-01");
check("jan", primeiraOcorrencia(d31), "2026-01-31");
check("fev corta para 28", proximaOcorrencia(d31, "2026-01-31"), "2026-02-28");
check(
  "mar VOLTA para 31 (não fica preso no 28)",
  proximaOcorrencia(d31, "2026-02-28"),
  "2026-03-31",
);
check("abr corta para 30", proximaOcorrencia(d31, "2026-03-31"), "2026-04-30");
check("mai volta para 31", proximaOcorrencia(d31, "2026-04-30"), "2026-05-31");

console.log("\n--- geração dentro da janela ---");
check(
  "aluguel dia 10, 6 meses",
  ocorrencias(mensal(10, "2026-07-01"), null, "2026-12-31"),
  ["2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10", "2026-11-10", "2026-12-10"],
);
check(
  "continua de onde parou (não repete o que já existe)",
  ocorrencias(mensal(10, "2026-07-01"), "2026-09-10", "2026-11-30"),
  ["2026-10-10", "2026-11-10"],
);
check(
  "respeita a data de término",
  ocorrencias(mensal(10, "2026-07-01", "2026-09-30"), null, "2026-12-31"),
  ["2026-07-10", "2026-08-10", "2026-09-10"],
);
check(
  "horizonte antes da primeira ocorrência gera nada",
  ocorrencias(mensal(10, "2026-07-01"), null, "2026-07-05"),
  [],
);

console.log("\n--- outras frequências ---");
check(
  "semanal",
  ocorrencias(
    { frequency: "weekly", dayOfMonth: null, startDate: "2026-07-01", endDate: null },
    null,
    "2026-07-29",
  ),
  ["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"],
);
check(
  "quinzenal atravessa o mês",
  ocorrencias(
    { frequency: "biweekly", dayOfMonth: null, startDate: "2026-07-25", endDate: null },
    null,
    "2026-08-25",
  ),
  ["2026-07-25", "2026-08-08", "2026-08-22"],
);
check(
  "trimestral",
  ocorrencias(
    { frequency: "quarterly", dayOfMonth: 15, startDate: "2026-01-01", endDate: null },
    null,
    "2026-12-31",
  ),
  ["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"],
);
check(
  "anual (IPVA)",
  ocorrencias(
    { frequency: "annual", dayOfMonth: 20, startDate: "2026-01-01", endDate: null },
    null,
    "2028-12-31",
  ),
  ["2026-01-20", "2027-01-20", "2028-01-20"],
);

console.log("\n--- proteções ---");
const muitas = ocorrencias(
  { frequency: "weekly", dayOfMonth: null, startDate: "2020-01-01", endDate: null },
  null,
  "2030-01-01",
);
check("trava de segurança impede laço infinito", muitas.length <= 500, true);

console.log(f === 0 ? "\nTudo passou.\n" : `\n${f} falharam.\n`);
process.exit(f === 0 ? 0 : 1);
