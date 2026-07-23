/**
 * Teste unitário da projeção de metas (cálculo puro). Foco no bug corrigido: a
 * semente (aporte inicial) não pode inflar o ritmo.
 * Rodar: npx tsx scripts/check-metas.ts
 */
import { projetarMeta } from "../src/lib/goals-calc";

const HOJE = new Date("2026-07-21T12:00:00");
const menosDias = (n: number) => {
  const d = new Date(HOJE.getTime() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const maisDias = (n: number) => {
  const d = new Date(HOJE.getTime() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let falhas = 0;
function eq(label: string, atual: unknown, esperado: unknown) {
  const ok = atual === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}${ok ? "" : ` — esperado ${esperado}, veio ${atual}`}`);
}

// ---- Caso A: o BUG. Meta recém-criada só com a semente. ----
// Antes: ritmoDiario = 2000/1 = 2000/dia → R$60.000/mês e "chega em 5 dias".
// Agora: a semente não conta como ritmo → sem projeção.
const a = projetarMeta({
  guardado: 2000_00,
  guardadoDurante: 0, // semente datada no startDate = excluída
  targetAmount: 12000_00,
  startDate: menosDias(0),
  targetDate: maisDias(90),
  hoje: HOJE,
});
eq("A: percentual (semente conta no progresso)", a.percentual, 17);
eq("A: ritmo mensal não inflado", a.ritmoMensal, 0);
eq("A: sem previsão irreal", a.previsao, null);
eq("A: noRitmo indefinido", a.noRitmo, null);

// ---- Caso B: ritmo real, 30 dias, R$3.000 aportados após o início. ----
const b = projetarMeta({
  guardado: 5000_00, // 2000 semente + 3000 aportes
  guardadoDurante: 3000_00,
  targetAmount: 12000_00,
  startDate: menosDias(30),
  targetDate: maisDias(100),
  hoje: HOJE,
});
eq("B: percentual", b.percentual, 42);
eq("B: falta", b.falta, 7000_00);
eq("B: ritmo mensal real (3000/mês)", b.ritmoMensal, 3000_00);
eq("B: tem previsão", b.previsao, "2026-09-29");
eq("B: dentro do prazo (alvo +100d)", b.noRitmo, true);

// ---- Caso C: mesmo ritmo, mas prazo curto → fora do ritmo. ----
const c = projetarMeta({
  guardado: 5000_00,
  guardadoDurante: 3000_00,
  targetAmount: 12000_00,
  startDate: menosDias(30),
  targetDate: maisDias(50), // 2026-09-09, antes da previsão 09-29
  hoje: HOJE,
});
eq("C: fora do prazo (alvo +50d)", c.noRitmo, false);

// ---- Caso D: meta atingida. ----
const d = projetarMeta({
  guardado: 12000_00,
  guardadoDurante: 10000_00,
  targetAmount: 12000_00,
  startDate: menosDias(60),
  targetDate: maisDias(30),
  hoje: HOJE,
});
eq("D: atingida", d.atingida, true);
eq("D: percentual 100", d.percentual, 100);
eq("D: falta 0", d.falta, 0);
eq("D: sem previsão (já chegou)", d.previsao, null);

// ---- Caso E: sem data alvo — projeta, mas noRitmo fica indefinido. ----
const e = projetarMeta({
  guardado: 5000_00,
  guardadoDurante: 3000_00,
  targetAmount: 12000_00,
  startDate: menosDias(30),
  targetDate: null,
  hoje: HOJE,
});
eq("E: tem previsão sem data alvo", e.previsao, "2026-09-29");
eq("E: noRitmo indefinido sem alvo", e.noRitmo, null);
eq("E: precisaPorMes indefinido sem alvo", e.precisaPorMes, null);

console.log(falhas === 0 ? "\nTudo passou.\n" : `\n${falhas} falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
