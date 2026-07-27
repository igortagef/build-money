"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter, X, Check, ChevronDown, Search } from "lucide-react";
import { cn, Button } from "@/components/ui";

/**
 * Normaliza para busca: sem acento e sem caixa.
 * Sem isso, procurar "agua" não acharia "Água" — e ninguém digita acento
 * numa caixa de busca com pressa.
 */
function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Filtros por conta, categoria e centro de custo.
 *
 * Tudo vive na URL, não em estado do cliente: assim o usuário pode favoritar
 * "despesas de Alimentação no cartão", voltar pelo histórico do navegador e
 * compartilhar o link — e a página continua sendo renderizada no servidor.
 */

export type Opcao = { id: string; label: string; grupo?: string };

type Props = {
  contas: Opcao[];
  categorias: Opcao[];
  centros: Opcao[];
};

const CHAVES = ["conta", "categoria", "centro"] as const;
type Chave = (typeof CHAVES)[number];

const ROTULOS: Record<Chave, string> = {
  conta: "Conta",
  categoria: "Categoria",
  centro: "Centro de custo",
};

export function Filtros({ contas, categorias, centros }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [aberto, setAberto] = useState<Chave | null>(null);
  const [busca, setBusca] = useState("");
  // Busca livre da lista (descrição/categoria/valor). Vive na URL como ?q=,
  // com um respiro (debounce) para não navegar a cada tecla.
  const [q, setQ] = useState(params.get("q") ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const atual = params.get("q") ?? "";
    if (q.trim() === atual) return;
    const t = setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (q.trim()) novos.set("q", q.trim());
      else novos.delete("q");
      router.push(`${pathname}?${novos.toString()}`);
    }, 350);
    return () => clearTimeout(t);
  }, [q, params, pathname, router]);

  const opcoes: Record<Chave, Opcao[]> = {
    conta: contas,
    categoria: categorias,
    centro: centros,
  };

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setAberto(null);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(null);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  /** Valores marcados de um filtro (a URL aceita vários: ?conta=a&conta=b). */
  function selecionados(chave: Chave): string[] {
    return params.getAll(chave);
  }

  function alternar(chave: Chave, id: string) {
    const novos = new URLSearchParams(params.toString());
    const atuais = novos.getAll(chave);
    novos.delete(chave);

    const proximos = atuais.includes(id)
      ? atuais.filter((v) => v !== id)
      : [...atuais, id];

    for (const v of proximos) novos.append(chave, v);
    router.push(`${pathname}?${novos.toString()}`);
  }

  function limparTudo() {
    const novos = new URLSearchParams(params.toString());
    for (const c of CHAVES) novos.delete(c);
    router.push(`${pathname}?${novos.toString()}`);
  }

  const totalAtivos = CHAVES.reduce((s, c) => s + selecionados(c).length, 0);

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2">
      {/* Busca livre: descrição, categoria ou valor (ex.: "mercado", "150"). */}
      <div className="relative w-full sm:w-72">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && q) {
              e.stopPropagation();
              setQ("");
            }
          }}
          placeholder="Buscar por descrição, categoria ou valor…"
          aria-label="Buscar lançamentos"
          className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground/60"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Filter className="size-3.5" aria-hidden />
        Filtrar
      </span>

      {CHAVES.map((chave) => {
        const marcados = selecionados(chave);
        const lista = opcoes[chave];
        const ativo = marcados.length > 0;

        // A busca só aparece onde há lista longa o bastante para justificar.
        const temBusca = lista.length > 8;
        const termo = normalizar(busca.trim());
        const visiveis =
          aberto === chave && termo
            ? lista.filter((o) => normalizar(o.label).includes(termo))
            : lista;

        return (
          <div key={chave} className="relative">
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setAberto((a) => (a === chave ? null : chave));
              }}
              aria-expanded={aberto === chave}
              aria-haspopup="menu"
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                ativo
                  ? "border-primary-border bg-primary-subtle text-primary-text"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {ROTULOS[chave]}
              {ativo && (
                <span className="tabular rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {marcados.length}
                </span>
              )}
              <ChevronDown className="size-3.5" aria-hidden />
            </button>

            {aberto === chave && (
              <div
                role="menu"
                className="absolute left-0 top-10 z-20 w-72 rounded-card border border-border bg-surface p-1 shadow-lg"
              >
                {temBusca && (
                  // Fica fora da área rolável: buscar e ver a lista rolar
                  // embaixo é melhor que perder o campo ao rolar.
                  <div className="relative border-b border-border p-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      autoFocus
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          if (busca) {
                            e.stopPropagation();
                            setBusca("");
                          }
                        }
                      }}
                      placeholder={`Buscar ${ROTULOS[chave].toLowerCase()}…`}
                      aria-label={`Buscar ${ROTULOS[chave].toLowerCase()}`}
                      className="h-8 w-full rounded-md bg-transparent pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                    />
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto p-0.5">
                {lista.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Nada para filtrar aqui ainda.
                  </p>
                ) : visiveis.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Nada encontrado para “{busca}”.
                  </p>
                ) : (
                  visiveis.map((o) => {
                    const marcado = marcados.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={marcado}
                        onClick={() => alternar(chave, o.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                          marcado
                            ? "bg-primary-subtle text-primary-text"
                            : "hover:bg-surface-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border",
                            marcado
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border-strong",
                          )}
                          aria-hidden
                        >
                          {marcado && <Check className="size-3" />}
                        </span>
                        <span className="truncate">{o.label}</span>
                      </button>
                    );
                  })
                )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {totalAtivos > 0 && (
        <Button variant="ghost" size="sm" onClick={limparTudo}>
          <X className="size-3.5" />
          Limpar {totalAtivos}
        </Button>
      )}
    </div>
  );
}
