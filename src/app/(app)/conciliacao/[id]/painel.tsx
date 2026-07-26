"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles, Receipt, ArrowLeftRight, Search } from "lucide-react";
import { conciliarLinha, criarEConciliar, criarTransferenciaEConciliar } from "../ofx-actions";
import { conciliarReembolso } from "../../rachas/actions";
import type { CandidatoBusca } from "@/lib/conciliacao-ofx";
import { formatMoney } from "@/lib/money";
import { buttonClasses, cn } from "@/components/ui";
import { FaturaSelect } from "@/components/fatura-select";
import type { CurrencyCode } from "@/db/schema";

type Categoria = { id: string; label: string };
type Conta = { id: string; name: string };
type Sugestao = {
  ids: string[];
  description: string;
  date: string;
  amount: number;
  confianca: "alta" | "media";
  racha?: boolean;
} | null;

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const d = (iso: string) => DATA.format(new Date(`${iso}T12:00:00`));

/**
 * Painel do lado "App" de uma linha do extrato. Mostra o par sugerido (se
 * houver) e, abaixo, as formas de tratar a linha manualmente: criar um
 * lançamento novo ou lançar uma transferência entre contas. (Buscar um
 * lançamento existente entra numa etapa seguinte.)
 */
export function PainelConciliacao({
  linhaId,
  accountId,
  descricaoInicial,
  valorLinha,
  currency,
  sugestao,
  sugestaoCat,
  categorias,
  contas,
  candidatos,
  dataLinha,
  reembolsos,
  cartao,
}: {
  linhaId: string;
  accountId: string;
  descricaoInicial: string;
  valorLinha: number;
  currency: CurrencyCode;
  sugestao: Sugestao;
  sugestaoCat: string | null;
  categorias: Categoria[];
  contas: Conta[];
  candidatos: CandidatoBusca[];
  dataLinha: string;
  reembolsos: { participantId: string; nome: string | null; amount: number; racha: string }[];
  cartao: { diaFechamento: number; diaVencimento: number } | null;
}) {
  const [aba, setAba] = useState<"lancamento" | "transferencia" | "buscar">("lancamento");
  const [termo, setTermo] = useState("");
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  // Competência do lançamento criado pela conciliação: começa na data da linha,
  // mas o usuário pode ajustar (a compra pode ter ocorrido noutro dia).
  const [dataComp, setDataComp] = useState(dataLinha);

  const alternar = (id: string) => {
    const proximo = new Set(sel);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    setSel(proximo);
  };
  // Soma COM SINAL: precisa bater exato com a linha do banco (que também tem
  // sinal). Assim, conferir a linha cheia contra só uma perna do racha não bate.
  const somaSel = candidatos.filter((c) => sel.has(c.id)).reduce((s, c) => s + c.amount, 0);
  const somaBate = sel.size > 0 && somaSel === valorLinha;
  // Reembolsos possíveis desta ENTRADA: participantes cuja cota bate com o valor.
  const reembolsosMatch = valorLinha > 0 ? reembolsos.filter((r) => r.amount === valorLinha) : [];

  // Resultados da busca: filtra por texto; sem texto, mostra os de MESMO valor
  // primeiro (o casamento mais provável). Limita para não poluir.
  const resultados = useMemo(() => {
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const t = norm(termo.trim());
    const alvo = Math.abs(valorLinha);
    const dist = (iso: string) =>
      Math.abs(
        new Date(`${iso}T12:00:00`).getTime() - new Date(`${dataLinha}T12:00:00`).getTime(),
      );
    return candidatos
      .filter((c) => (t ? norm(c.description).includes(t) : true))
      .sort((a, b) => {
        // Mesmo valor da linha primeiro; depois o mais próximo da data da linha
        // — é onde caem as duas pernas de um racha (a de saída pode ser antiga).
        const am = Math.abs(a.amount) === alvo ? 0 : 1;
        const bm = Math.abs(b.amount) === alvo ? 0 : 1;
        if (am !== bm) return am - bm;
        return dist(a.date) - dist(b.date);
      })
      .slice(0, 40);
  }, [candidatos, termo, valorLinha, dataLinha]);

  return (
    <div className="space-y-3">
      {/* Entrada que casa com a cota de um participante de racha: um clique marca
          a pessoa como paga e concilia. */}
      {reembolsosMatch.length > 0 && (
        <div className="space-y-2 rounded-lg border border-income/25 bg-income-subtle/40 p-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-income-subtle px-2 py-0.5 text-[10px] font-semibold text-income">
            <Check className="size-3" />
            Reembolso de racha
          </span>
          <p className="text-[11px] text-muted-foreground">
            Quem te pagou este valor? Marca a pessoa como paga e concilia de uma vez.
          </p>
          {reembolsosMatch.map((r) => (
            <form key={r.participantId} action={conciliarReembolso} className="flex items-center gap-2">
              <input type="hidden" name="linhaId" value={linhaId} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="participantId" value={r.participantId} />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{r.nome ?? "Participante"}</span>{" "}
                <span className="text-xs text-muted-foreground">· {r.racha}</span>
              </span>
              <button type="submit" className={buttonClasses("primary", "sm")}>
                <Check className="size-3.5" />
                {formatMoney(r.amount, currency)}
              </button>
            </form>
          ))}
        </div>
      )}

      {/* Par sugerido pelo casamento automático */}
      {sugestao && (
        <form action={conciliarLinha} className="space-y-2 rounded-lg border border-income/25 bg-income-subtle/40 p-3">
          <input type="hidden" name="linhaId" value={linhaId} />
          <input type="hidden" name="transactionIds" value={sugestao.ids.join(",")} />
          <input type="hidden" name="accountId" value={accountId} />
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              sugestao.confianca === "alta" ? "bg-income-subtle text-income" : "bg-xp-subtle text-warning",
            )}
          >
            <Sparkles className="size-3" />
            {sugestao.racha ? "Racha (2 lançamentos)" : sugestao.confianca === "alta" ? "Par encontrado" : "Par provável"}
          </span>
          <div>
            <p className="text-sm font-medium">{sugestao.description}</p>
            <p className="text-xs text-muted-foreground">
              {d(sugestao.date)} · {formatMoney(Math.abs(sugestao.amount), currency)}
            </p>
          </div>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            <Check className="size-3.5" />
            Conciliar
          </button>
        </form>
      )}

      {/* Abas: novo lançamento / nova transferência */}
      <div className="flex gap-1 rounded-lg bg-surface-muted p-0.5">
        <button
          type="button"
          onClick={() => setAba("lancamento")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            aba === "lancamento" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Receipt className="size-3.5" />
          Novo lançamento
        </button>
        <button
          type="button"
          onClick={() => setAba("transferencia")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            aba === "transferencia" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeftRight className="size-3.5" />
          Nova transferência
        </button>
        <button
          type="button"
          onClick={() => setAba("buscar")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            aba === "buscar" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Search className="size-3.5" />
          Buscar lançamento
        </button>
      </div>

      {aba === "lancamento" && (
        <form action={criarEConciliar} className="space-y-3">
          <input type="hidden" name="linhaId" value={linhaId} />
          <input type="hidden" name="accountId" value={accountId} />
          <label className="block text-xs font-medium text-muted-foreground">
            Descrição
            <input
              name="descricao"
              defaultValue={descricaoInicial}
              required
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Data (competência)
            <input
              type="date"
              name="date"
              value={dataComp}
              onChange={(e) => setDataComp(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Categoria
            <select
              name="categoryId"
              defaultValue={sugestaoCat ?? ""}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {sugestaoCat && <p className="text-[11px] text-primary-text">Categoria sugerida pelas suas regras.</p>}
          {cartao && (
            <label className="block text-xs font-medium text-muted-foreground">
              Fatura
              <FaturaSelect
                dataCompra={dataComp}
                diaFechamento={cartao.diaFechamento}
                diaVencimento={cartao.diaVencimento}
              />
            </label>
          )}
          <button type="submit" className={buttonClasses("primary", "sm")}>
            <Check className="size-3.5" />
            Criar e conciliar
          </button>
        </form>
      )}

      {aba === "transferencia" && (
        <form action={criarTransferenciaEConciliar} className="space-y-3">
          <input type="hidden" name="linhaId" value={linhaId} />
          <input type="hidden" name="accountId" value={accountId} />
          <p className="text-[11px] text-muted-foreground">
            {valorLinha > 0
              ? "Entrou dinheiro nesta conta vindo de outra conta sua — escolha de onde veio."
              : "Saiu dinheiro desta conta para outra conta sua (aplicação, pagamento de fatura) — escolha para onde foi."}
          </p>
          <label className="block text-xs font-medium text-muted-foreground">
            Descrição
            <input
              name="descricao"
              defaultValue={descricaoInicial}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {valorLinha > 0 ? "Conta de origem (de onde veio)" : "Conta de destino (para onde foi)"}
            <select
              name="contaDestinoId"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              <option value="" disabled>
                Escolha a conta…
              </option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={contas.length === 0} className={buttonClasses("primary", "sm")}>
            <Check className="size-3.5" />
            Criar transferência e conciliar
          </button>
        </form>
      )}

      {aba === "buscar" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar por descrição…"
              className="block w-full rounded-lg border border-border bg-surface py-1.5 pl-9 pr-2 text-sm text-foreground"
            />
          </div>
          {resultados.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Nenhum lançamento em aberto encontrado.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                Marque um ou vários lançamentos que juntos formam esta linha do banco.
              </p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {resultados.map((c) => {
                  const mesmoValor = Math.abs(c.amount) === Math.abs(valorLinha);
                  const marcado = sel.has(c.id);
                  return (
                    <li key={c.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border p-2",
                          marcado ? "border-primary bg-primary-subtle/40" : "border-border",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(c.id)}
                          className="size-4 shrink-0 accent-[var(--brand-teal)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{c.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {d(c.date)} · {formatMoney(Math.abs(c.amount), currency)}
                            {c.status === "pending" ? " · previsto" : " · realizado"}
                            {mesmoValor && <span className="ml-1 font-semibold text-income">· mesmo valor</span>}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {sel.size > 0 && (
                <form action={conciliarLinha} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-muted/40 p-2">
                  <input type="hidden" name="linhaId" value={linhaId} />
                  <input type="hidden" name="transactionIds" value={[...sel].join(",")} />
                  <input type="hidden" name="accountId" value={accountId} />
                  <span className="text-xs text-muted-foreground">
                    {sel.size} selecionado{sel.size > 1 ? "s" : ""} · soma{" "}
                    <strong className={cn("tabular", somaBate ? "text-income" : "text-warning")}>
                      {formatMoney(Math.abs(somaSel), currency)}
                    </strong>
                    {somaBate ? " · bate" : ` de ${formatMoney(Math.abs(valorLinha), currency)}`}
                  </span>
                  <button
                    type="submit"
                    disabled={!somaBate}
                    title={somaBate ? undefined : "A soma dos selecionados precisa bater com a linha do banco"}
                    className={buttonClasses("primary", "sm") + " ml-auto disabled:opacity-50"}
                  >
                    <Check className="size-3.5" />
                    Conciliar {sel.size > 1 ? "selecionados" : ""}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
