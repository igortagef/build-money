"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, Clock, Info, PartyPopper, Check } from "lucide-react";
import type { Alerta, SeveridadeAlerta } from "@/lib/alertas";
import { cn } from "./ui";

const META: Record<SeveridadeAlerta, { Icon: React.ComponentType<{ className?: string }>; cor: string; fundo: string }> = {
  danger: { Icon: AlertTriangle, cor: "text-expense", fundo: "bg-expense-subtle" },
  warning: { Icon: Clock, cor: "text-warning", fundo: "bg-xp-subtle" },
  info: { Icon: Info, cor: "text-primary-text", fundo: "bg-primary-subtle" },
  success: { Icon: PartyPopper, cor: "text-income", fundo: "bg-income-subtle" },
};

/**
 * Sino de alertas no cabeçalho: mostra quantos itens pedem atenção e abre uma
 * lista com atalho para resolver cada um. A lista vem pronta do servidor
 * (lib/alertas), então o sino é só apresentação.
 */
export function AlertasBell({ alertas }: { alertas: Alerta[] }) {
  const [aberto, setAberto] = useState(false);
  const total = alertas.length;
  const temGrave = alertas.some((a) => a.severidade === "danger");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={total > 0 ? `${total} alerta(s)` : "Alertas"}
        aria-expanded={aberto}
        className="relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {total > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-background",
              temGrave ? "bg-expense" : "bg-warning",
            )}
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} aria-hidden />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Alertas</span>
              <span className="text-xs text-muted-foreground">
                {total === 0 ? "tudo em dia" : `${total} ${total === 1 ? "item" : "itens"}`}
              </span>
            </div>

            {total === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-income-subtle text-income">
                  <Check className="size-5" />
                </span>
                <p className="text-sm text-muted-foreground">Nada pendente por aqui. 🎉</p>
              </div>
            ) : (
              <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                {alertas.map((a) => {
                  const m = META[a.severidade];
                  return (
                    <li key={a.id}>
                      <Link
                        href={a.href}
                        onClick={() => setAberto(false)}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                      >
                        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", m.fundo, m.cor)}>
                          <m.Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{a.titulo}</p>
                          <p className="text-xs text-muted-foreground">{a.descricao}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
