"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { PAINEL_WIDGETS, PAINEL_GRUPOS } from "@/lib/dashboard-widgets";
import { salvarPainel } from "./dashboard-actions";
import { buttonClasses, cn } from "@/components/ui";

/**
 * Editor do painel: a pessoa escolhe quais blocos aparecem. O que está marcado
 * é mostrado; desmarcar esconde. Salva a preferência (por usuário) e recarrega
 * o painel para refletir a escolha.
 */
export function PainelPersonalizar({ hidden }: { hidden: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocultos, setOcultos] = useState<ReadonlySet<string>>(new Set(hidden));
  const [salvando, setSalvando] = useState(false);

  const toggle = (id: string) =>
    setOcultos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const salvar = async () => {
    setSalvando(true);
    await salvarPainel([...ocultos]);
    setSalvando(false);
    setAberto(false);
    router.refresh();
  };

  const abrir = () => {
    setOcultos(new Set(hidden)); // parte sempre do estado salvo
    setAberto(true);
  };

  return (
    <>
      <button type="button" onClick={abrir} className={buttonClasses("secondary", "sm")}>
        <SlidersHorizontal className="size-4" />
        Personalizar
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAberto(false)} aria-hidden />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-card bg-surface shadow-xl sm:rounded-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h2 className="font-semibold">Personalizar painel</h2>
                <p className="text-xs text-muted-foreground">Escolha os blocos que quer ver.</p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {PAINEL_GRUPOS.map((grupo) => (
                <div key={grupo}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {grupo}
                  </p>
                  <div className="space-y-1">
                    {PAINEL_WIDGETS.filter((w) => w.grupo === grupo).map((w) => {
                      const visivel = !ocultos.has(w.id);
                      return (
                        <label
                          key={w.id}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
                        >
                          <span className={cn(!visivel && "text-muted-foreground")}>{w.label}</span>
                          <input
                            type="checkbox"
                            checked={visivel}
                            onChange={() => toggle(w.id)}
                            className="size-4 accent-[var(--primary)]"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border p-4">
              <button
                type="button"
                onClick={() => setOcultos(new Set())}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Mostrar tudo
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAberto(false)} className={buttonClasses("ghost", "sm")}>
                  Cancelar
                </button>
                <button type="button" onClick={salvar} disabled={salvando} className={buttonClasses("primary", "sm")}>
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
