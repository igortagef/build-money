"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ClipboardPaste, Check, X } from "lucide-react";
import { createBatch } from "./actions";
import { Button, Card, Select, cn } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";
import { parseTSV, parseDataFlexivel, casarCategoria } from "@/lib/paste";
import type { CurrencyCode } from "@/db/schema";

type Conta = { id: string; name: string; currency: CurrencyCode };
type Categoria = { id: string; label: string; type: "income" | "expense" };

type Linha = {
  key: number;
  data: string; // ISO
  descricao: string;
  categoryId: string;
  valor: string;
};

let seq = 1;
const linhaVazia = (): Linha => ({
  key: seq++,
  data: "",
  descricao: "",
  categoryId: "",
  valor: "",
});

/** Uma linha só entra no lote se tem os quatro campos preenchidos. */
function linhaCompleta(l: Linha): boolean {
  return !!l.data && !!l.descricao.trim() && !!l.categoryId && (parseMoney(l.valor) ?? 0) > 0;
}
/** Vazia de vez: ignorada em silêncio (não é erro). */
function linhaVaziaDeVerdade(l: Linha): boolean {
  return !l.data && !l.descricao.trim() && !l.categoryId && !l.valor.trim();
}

export function BatchGrid({
  contas,
  categorias,
  hoje,
}: {
  contas: Conta[];
  categorias: Categoria[];
  hoje: string;
}) {
  const router = useRouter();
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [tipo, setTipo] = useState<"expense" | "income">("expense");
  const [status, setStatus] = useState<"cleared" | "pending">("cleared");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    Array.from({ length: 4 }, linhaVazia),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [avisoColar, setAvisoColar] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const conta = contas.find((c) => c.id === contaId);
  const moeda = conta?.currency ?? "BRL";
  const opcoes = categorias.filter((c) => c.type === tipo);

  function setCampo(key: number, campo: keyof Linha, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  function garantirLinhas(n: number) {
    setLinhas((ls) => {
      if (ls.length >= n) return ls;
      return [...ls, ...Array.from({ length: n - ls.length }, linhaVazia)];
    });
  }

  /**
   * Cola do Excel. O TSV é distribuído a partir da linha/coluna onde o cursor
   * está. Colunas na ordem visual: Data, Descrição, Valor. Uma 4ª coluna, se
   * vier, é tentada como categoria (casada por nome).
   */
  function aoColar(
    e: React.ClipboardEvent,
    linhaIdx: number,
    colInicial: number,
  ) {
    const texto = e.clipboardData.getData("text/plain");
    if (!texto.includes("\t") && !texto.includes("\n")) return; // colar simples: deixa o input tratar

    e.preventDefault();
    const matriz = parseTSV(texto);
    const COLS = ["data", "descricao", "valor", "categoria"] as const;

    let casadas = 0;
    let naoCasadas = 0;

    setLinhas((ls) => {
      const copia = [...ls];
      // Garante linhas suficientes para o que foi colado.
      while (copia.length < linhaIdx + matriz.length) copia.push(linhaVazia());

      matriz.forEach((cells, r) => {
        const alvo = { ...copia[linhaIdx + r] };
        cells.forEach((valor, c) => {
          const col = COLS[colInicial + c];
          if (!col) return;
          if (col === "data") {
            alvo.data = parseDataFlexivel(valor) ?? "";
          } else if (col === "descricao") {
            alvo.descricao = valor.trim();
          } else if (col === "valor") {
            const cent = parseMoney(valor);
            alvo.valor = cent !== null ? valor.trim() : "";
          } else if (col === "categoria") {
            const id = casarCategoria(valor, opcoes);
            if (id) {
              alvo.categoryId = id;
              casadas++;
            } else if (valor.trim()) {
              naoCasadas++;
            }
          }
        });
        copia[linhaIdx + r] = alvo;
      });
      return copia;
    });

    const partes: string[] = [`${matriz.length} linha(s) coladas.`];
    if (casadas) partes.push(`${casadas} categoria(s) reconhecida(s).`);
    if (naoCasadas)
      partes.push(`${naoCasadas} categoria(s) não reconhecida(s) — escolha na lista.`);
    setAvisoColar(partes.join(" "));
  }

  const completas = linhas.filter(linhaCompleta);
  const comErro = linhas.filter((l) => !linhaVaziaDeVerdade(l) && !linhaCompleta(l));
  const total = completas.reduce((s, l) => s + (parseMoney(l.valor) ?? 0), 0);

  function salvar() {
    setErro(null);
    if (completas.length === 0) {
      setErro("Preencha ao menos uma linha completa.");
      return;
    }
    if (comErro.length > 0) {
      setErro(
        `${comErro.length} linha(s) estão incompletas. Complete ou limpe antes de salvar.`,
      );
      return;
    }

    iniciar(async () => {
      const r = await createBatch({
        accountId: contaId,
        type: tipo,
        status,
        linhas: completas.map((l) => ({
          data: l.data,
          descricao: l.descricao.trim(),
          categoryId: l.categoryId,
          amount: parseMoney(l.valor)!,
        })),
      });
      if (r.ok) router.push("/lancamentos");
      else setErro(r.erro);
    });
  }

  return (
    <div className="space-y-4">
      {/* Definições comuns a todo o lote */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-40 flex-1">
          <label htmlFor="lote-conta" className="mb-1 block text-xs font-medium text-muted-foreground">
            Conta
          </label>
          <Select
            id="lote-conta"
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
          >
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        <div className="min-w-32">
          <label htmlFor="lote-tipo" className="mb-1 block text-xs font-medium text-muted-foreground">
            Tipo
          </label>
          <Select
            id="lote-tipo"
            value={tipo}
            onChange={(e) => {
              const novo = e.target.value as "expense" | "income";
              setTipo(novo);
              // Muda o plano de categorias; as já escolhidas não valem mais.
              setLinhas((ls) => ls.map((l) => ({ ...l, categoryId: "" })));
            }}
          >
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
          </Select>
        </div>

        <div className="min-w-32">
          <label htmlFor="lote-status" className="mb-1 block text-xs font-medium text-muted-foreground">
            Situação
          </label>
          <Select
            id="lote-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "cleared" | "pending")}
          >
            <option value="cleared">Já aconteceram</option>
            <option value="pending">Previstos</option>
          </Select>
        </div>
      </Card>

      {/* Dica de colar */}
      <div className="flex items-start gap-2 rounded-lg border border-primary-border bg-primary-subtle/40 px-3 py-2 text-xs text-primary-text">
        <ClipboardPaste className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Cole direto do Excel: selecione as células (Data · Descrição · Valor,
          nessa ordem) e cole em qualquer linha. Uma 4ª coluna com o nome da
          categoria é reconhecida automaticamente.
        </span>
      </div>

      {avisoColar && (
        <div className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
          {avisoColar}
        </div>
      )}

      {/* A grade */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/50 text-left text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2"></th>
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium">Descrição</th>
                <th className="px-2 py-2 font-medium">Categoria</th>
                <th className="px-2 py-2 text-right font-medium">Valor</th>
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const preenchida = !linhaVaziaDeVerdade(l);
                const ok = linhaCompleta(l);
                return (
                  <tr key={l.key} className="border-b border-border last:border-0">
                    <td className="px-2 text-center">
                      {preenchida &&
                        (ok ? (
                          <Check className="mx-auto size-3.5 text-income" aria-label="linha completa" />
                        ) : (
                          <X className="mx-auto size-3.5 text-warning" aria-label="linha incompleta" />
                        ))}
                    </td>
                    <td className="p-1">
                      <input
                        type="date"
                        value={l.data}
                        onChange={(e) => setCampo(l.key, "data", e.target.value)}
                        onPaste={(e) => aoColar(e, i, 0)}
                        aria-label={`Data linha ${i + 1}`}
                        className="h-8 w-36 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-primary focus:outline-none"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={l.descricao}
                        onChange={(e) => setCampo(l.key, "descricao", e.target.value)}
                        onPaste={(e) => aoColar(e, i, 1)}
                        placeholder="Descrição"
                        aria-label={`Descrição linha ${i + 1}`}
                        className="h-8 w-full min-w-32 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-primary focus:outline-none"
                      />
                    </td>
                    <td className="p-1">
                      <Select
                        value={l.categoryId}
                        onChange={(e) => setCampo(l.key, "categoryId", e.target.value)}
                        aria-label={`Categoria linha ${i + 1}`}
                        className="h-8 min-w-40 text-sm"
                      >
                        <option value="">—</option>
                        {opcoes.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="p-1">
                      <input
                        inputMode="decimal"
                        value={l.valor}
                        onChange={(e) => setCampo(l.key, "valor", e.target.value)}
                        onPaste={(e) => aoColar(e, i, 2)}
                        placeholder="0,00"
                        aria-label={`Valor linha ${i + 1}`}
                        className="tabular h-8 w-28 rounded-md border border-transparent bg-transparent px-2 text-right text-sm hover:border-border focus:border-primary focus:outline-none"
                      />
                    </td>
                    <td className="px-1 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setLinhas((ls) =>
                            ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls.map((x) => (x.key === l.key ? linhaVazia() : x)),
                          )
                        }
                        aria-label={`Remover linha ${i + 1}`}
                        className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-expense-subtle hover:text-expense"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border p-3">
          <Button variant="ghost" size="sm" onClick={() => garantirLinhas(linhas.length + 5)}>
            <Plus className="size-4" />
            Mais linhas
          </Button>
          <p className="text-xs text-muted-foreground">
            {completas.length} pronta(s)
            {comErro.length > 0 && ` · ${comErro.length} incompleta(s)`}
          </p>
        </div>
      </Card>

      {erro && (
        <div role="alert" className="rounded-lg border border-expense/25 bg-expense-subtle px-3 py-2 text-sm text-expense">
          {erro}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {completas.length > 0 && (
            <>
              Total:{" "}
              <strong className={cn("tabular", tipo === "income" ? "text-income" : "text-expense")}>
                {formatMoney(total, moeda)}
              </strong>
            </>
          )}
        </p>
        <Button size="lg" onClick={salvar} disabled={pendente || completas.length === 0}>
          {pendente
            ? "Salvando…"
            : `Lançar ${completas.length || ""} ${completas.length === 1 ? "linha" : "linhas"}`.trim()}
        </Button>
      </div>
    </div>
  );
}
