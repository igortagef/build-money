"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Número que "sobe" de zero até o valor ao aparecer — dá a sensação de dinheiro
 * crescendo. O setState mora sempre dentro do requestAnimationFrame (nunca no
 * corpo do efeito), o que o compilador do React exige. Respeita
 * prefers-reduced-motion encurtando a animação a um quadro.
 */
export function AnimatedNumber({
  value,
  currency = "BRL",
  duration = 1100,
  plain = false,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  currency?: CurrencyCode;
  duration?: number;
  plain?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduz ? 0 : duration;
    const inicio = performance.now();

    const passo = (agora: number) => {
      const t = dur === 0 ? 1 : Math.min((agora - inicio) / dur, 1);
      setDisplay(Math.round(value * easeOut(t)));
      if (t < 1) raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const texto = plain ? display.toLocaleString("pt-BR") : formatMoney(display, currency);
  return (
    <span className={className}>
      {prefix}
      {texto}
      {suffix}
    </span>
  );
}

const CORES_CONFETE = [
  "var(--accent-goal)",
  "var(--accent-goal-2)",
  "var(--accent-wealth-2)",
  "var(--accent-split)",
  "var(--accent-budget-2)",
  "var(--accent-cash)",
];

/**
 * Chuva de confete dentro de um container relativo. Gera as peças uma vez (no
 * inicializador do estado, estável entre renders) e as deixa cair via CSS.
 * Puramente decorativo — aria-hidden e sem interação.
 */
export function Confetti({ count = 44 }: { count?: number }) {
  const [pecas] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 350,
      dur: 900 + Math.random() * 700,
      cor: CORES_CONFETE[i % CORES_CONFETE.length],
      escala: 0.7 + Math.random() * 0.8,
    })),
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pecas.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.cor,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.dur}ms`,
            transform: `scale(${p.escala})`,
          }}
        />
      ))}
    </div>
  );
}
