/**
 * Cálculo (puro) do progresso e da projeção de uma meta. Sem banco e sem
 * `server-only` de propósito: é a lógica que decide "no seu ritmo, quando você
 * chega?", isolada para poder ser testada diretamente.
 *
 * Regra central do ritmo: conta apenas o que foi acumulado DURANTE a meta. O
 * valor que a pessoa já tinha ao começar (a "semente" — o aporte inicial na
 * data de início) NÃO é poupança por dia; contá-lo inflava o ritmo e fazia a
 * projeção prometer datas irreais logo na criação da meta.
 */

export type EntradaProjecao = {
  /** Total guardado hoje (semente + aportes). Base do percentual e do que falta. */
  guardado: number;
  /** Acumulado APÓS a data de início (exclui a semente). Base do ritmo. */
  guardadoDurante: number;
  targetAmount: number;
  startDate: string; // YYYY-MM-DD
  targetDate: string | null; // YYYY-MM-DD
  /** Injetável para teste; padrão é agora. */
  hoje?: Date;
};

export type Projecao = {
  falta: number;
  percentual: number;
  atingida: boolean;
  ritmoDiario: number;
  ritmoMensal: number;
  previsao: string | null; // YYYY-MM-DD ou null
  noRitmo: boolean | null; // chega até a data alvo? null se não dá para dizer
  precisaPorMes: number | null;
};

const MS_DIA = 86_400_000;

/** Data local em YYYY-MM-DD (sem depender do fuso do toISOString). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function projetarMeta(e: EntradaProjecao): Projecao {
  const hoje = e.hoje ?? new Date();

  const falta = Math.max(0, e.targetAmount - e.guardado);
  const percentual =
    e.targetAmount > 0 ? Math.min(100, Math.round((e.guardado / e.targetAmount) * 100)) : 0;
  const atingida = e.guardado >= e.targetAmount;

  const inicio = new Date(`${e.startDate}T12:00:00`);
  const diasCorridos = Math.max(1, Math.round((hoje.getTime() - inicio.getTime()) / MS_DIA));

  // Só o acumulado durante a meta entra no ritmo; a semente (aporte inicial) não.
  const ritmoDiario = e.guardadoDurante > 0 ? e.guardadoDurante / diasCorridos : 0;
  const ritmoMensal = Math.round(ritmoDiario * 30);

  let previsao: string | null = null;
  let noRitmo: boolean | null = null;
  if (falta > 0 && ritmoDiario > 0) {
    const diasRestantes = Math.ceil(falta / ritmoDiario);
    // Além de ~10 anos a projeção deixa de dizer algo útil.
    if (diasRestantes < 3650) {
      previsao = isoLocal(new Date(hoje.getTime() + diasRestantes * MS_DIA));
      if (e.targetDate) noRitmo = previsao <= e.targetDate;
    }
  }

  let precisaPorMes: number | null = null;
  if (e.targetDate && falta > 0) {
    const alvo = new Date(`${e.targetDate}T12:00:00`);
    const mesesRestantes = Math.max(
      1,
      (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth()),
    );
    precisaPorMes = Math.ceil(falta / mesesRestantes);
  }

  return { falta, percentual, atingida, ritmoDiario, ritmoMensal, previsao, noRitmo, precisaPorMes };
}
