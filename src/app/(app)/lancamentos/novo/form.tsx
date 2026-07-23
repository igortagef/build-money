"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2, SplitSquareHorizontal } from "lucide-react";
import type { TxFormState } from "../actions";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  cn,
} from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";
import { splitEvenly } from "@/lib/money";
import { createTransaction, updateTransaction } from "../actions";
import {
  BotaoNovo,
  NovaContaInline,
  NovaCategoriaInline,
} from "./quick-create";
import type { CurrencyCode } from "@/db/schema";

type Conta = { id: string; name: string; currency: CurrencyCode };
type Categoria = { id: string; label: string; type: "income" | "expense" };

type Linha = { key: number; categoryId: string; amount: string };

/** Valores para pré-popular o form ao editar um lançamento existente. */
export type LancamentoInicial = {
  id: string;
  tipo: "expense" | "income";
  contaId: string;
  valor: string;
  descricao: string;
  data: string;
  status: string;
  rateado: boolean;
  splits: { categoryId: string; amount: string }[];
};

let proximaChave = 1;
const novaLinha = (): Linha => ({
  key: proximaChave++,
  categoryId: "",
  amount: "",
});

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

export function NewTransactionForm({
  contas: contasIniciais,
  categorias: categoriasIniciais,
  baseCurrency,
  hoje,
  inicial,
}: {
  contas: Conta[];
  categorias: Categoria[];
  baseCurrency: CurrencyCode;
  hoje: string;
  /** Presente = modo edição. Ausente = novo lançamento. */
  inicial?: LancamentoInicial;
}) {
  const editando = !!inicial;
  const [state, formAction] = useActionState<TxFormState, FormData>(
    editando ? updateTransaction : createTransaction,
    {},
  );

  /*
   * As listas começam com o que veio do servidor, mas viram estado local:
   * criar uma conta ou categoria aqui precisa aparecer na hora, sem recarregar
   * a página — recarregar descartaria o lançamento em digitação.
   */
  const [contas, setContas] = useState(contasIniciais);
  const [categorias, setCategorias] = useState(categoriasIniciais);
  const [criandoConta, setCriandoConta] = useState(false);
  const [criandoCategoria, setCriandoCategoria] = useState<number | null>(null);

  const [tipo, setTipo] = useState<"expense" | "income">(inicial?.tipo ?? "expense");
  const [contaId, setContaId] = useState(
    inicial?.contaId ?? contasIniciais[0]?.id ?? "",
  );
  const [valor, setValor] = useState(inicial?.valor ?? "");
  // Baixa de um previsto: começa desmarcada (o previsto continua previsto até
  // o usuário confirmar que pagou).
  const [pago, setPago] = useState(false);
  const [rateando, setRateando] = useState(inicial?.rateado ?? false);
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial
      ? inicial.splits.map((s) => ({ ...novaLinha(), ...s }))
      : [novaLinha()],
  );

  const conta = contas.find((c) => c.id === contaId);
  const moeda = conta?.currency ?? baseCurrency;
  const precisaTaxa = moeda !== baseCurrency;

  const opcoes = useMemo(
    () => categorias.filter((c) => c.type === tipo),
    [categorias, tipo],
  );

  const totalCentavos = parseMoney(valor) ?? 0;
  const somaRateio = linhas.reduce((s, l) => s + (parseMoney(l.amount) ?? 0), 0);
  const diferenca = totalCentavos - somaRateio;

  // Sem rateio o lançamento é uma linha só, e o valor dela é o total —
  // o usuário não precisa digitar o mesmo número duas vezes.
  const linhasEnviadas = rateando
    ? linhas
    : [{ ...linhas[0], amount: valor }];

  const podeEnviar =
    totalCentavos > 0 &&
    linhasEnviadas.every((l) => l.categoryId) &&
    (!rateando || diferenca === 0);

  function trocarTipo(novo: "expense" | "income") {
    setTipo(novo);
    // As categorias de receita e despesa são planos separados; manter a
    // seleção antiga produziria um lançamento de despesa em categoria de receita.
    setLinhas((ls) => ls.map((l) => ({ ...l, categoryId: "" })));
  }

  function dividirIgualmente() {
    if (totalCentavos <= 0 || linhas.length === 0) return;
    // splitEvenly distribui o resto nas primeiras linhas: a soma fecha exata.
    const partes = splitEvenly(totalCentavos, linhas.length);
    setLinhas((ls) =>
      ls.map((l, i) => ({
        ...l,
        amount: (partes[i] / 100).toFixed(2).replace(".", ","),
      })),
    );
  }

  function completarUltima() {
    if (diferenca === 0) return;
    setLinhas((ls) => {
      const copia = [...ls];
      const ultima = copia.length - 1;
      const atual = parseMoney(copia[ultima].amount) ?? 0;
      copia[ultima] = {
        ...copia[ultima],
        amount: ((atual + diferenca) / 100).toFixed(2).replace(".", ","),
      };
      return copia;
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      {editando && <input type="hidden" name="id" value={inicial.id} />}
      <input type="hidden" name="type" value={tipo} />
      <input
        type="hidden"
        name="splits"
        value={JSON.stringify(
          linhasEnviadas.map((l) => ({
            categoryId: l.categoryId,
            amount: l.amount,
          })),
        )}
      />

      {state.error && <Alert>{state.error}</Alert>}

      {/* Receita ou despesa: a escolha que mais muda o resto do formulário */}
      <div
        className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1"
        role="group"
        aria-label="Tipo de lançamento"
      >
        {(
          [
            { v: "expense", label: "Despesa" },
            { v: "income", label: "Receita" },
          ] as const
        ).map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => trocarTipo(v)}
            aria-pressed={tipo === v}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold transition-colors",
              tipo === v
                ? v === "expense"
                  ? "bg-expense text-white shadow-sm"
                  : "bg-income text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="space-y-5 p-5">
        <Field label="Valor" htmlFor="amount" error={state.fieldErrors?.amount}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {moeda === "BRL" ? "R$" : moeda === "USD" ? "US$" : "€"}
            </span>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
              className="tabular pl-10 text-lg font-semibold"
              invalid={!!state.fieldErrors?.amount}
            />
          </div>
        </Field>

        <Field
          label="Descrição"
          htmlFor="description"
          error={state.fieldErrors?.description}
        >
          <Input
            id="description"
            name="description"
            placeholder={tipo === "expense" ? "Ex.: Mercado do mês" : "Ex.: Salário"}
            required
            defaultValue={inicial?.descricao ?? ""}
            invalid={!!state.fieldErrors?.description}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Conta" htmlFor="accountId" error={state.fieldErrors?.accountId}>
              <div className="flex gap-2">
                <Select
                  id="accountId"
                  name="accountId"
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  invalid={!!state.fieldErrors?.accountId}
                >
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.currency !== baseCurrency ? ` (${c.currency})` : ""}
                    </option>
                  ))}
                </Select>
                <BotaoNovo
                  aberto={criandoConta}
                  onClick={() => setCriandoConta((v) => !v)}
                  rotulo="Cadastrar nova conta"
                />
              </div>
            </Field>

            <NovaContaInline
              aberto={criandoConta}
              onFechar={() => setCriandoConta(false)}
              baseCurrency={baseCurrency}
              onCriada={(nova) => {
                // Entra na lista e já fica selecionada: era para isso que o
                // usuário abriu o painel.
                setContas((cs) => [...cs, nova]);
                setContaId(nova.id);
              }}
            />
          </div>

          <Field label="Data" htmlFor="date" error={state.fieldErrors?.date}>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={hoje}
              required
              invalid={!!state.fieldErrors?.date}
            />
          </Field>
        </div>

        {precisaTaxa && (
          <Field
            label={`Cotação do ${moeda} em ${baseCurrency}`}
            htmlFor="exchangeRate"
            hint="A cotação fica gravada no lançamento, para relatórios antigos não mudarem com o câmbio de hoje."
          >
            <Input
              id="exchangeRate"
              name="exchangeRate"
              inputMode="decimal"
              defaultValue="1"
              className="tabular"
            />
          </Field>
        )}

        {/* Um lançamento já conciliado não expõe o seletor: mudar a situação
            desfaria a conciliação sem querer. Ele conserva o estado, e o
            hidden garante que a action receba "reconciled" de volta. */}
        {inicial?.status === "reconciled" ? (
          <input type="hidden" name="status" value="reconciled" />
        ) : editando && inicial?.status === "pending" ? (
          // Editando um previsto (ex.: conta fixa): a baixa é uma caixinha
          // explícita de "pago", mais direta que um seletor de situação.
          <>
            <input type="hidden" name="status" value={pago ? "cleared" : "pending"} />
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 has-[:checked]:border-income has-[:checked]:bg-income-subtle">
              <input
                type="checkbox"
                checked={pago}
                onChange={(e) => setPago(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--income)]"
              />
              <span>
                <span className="block text-sm font-medium">
                  {tipo === "income" ? "Já recebi" : "Já paguei"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Marque para dar baixa: sai do previsto e vira realizado no seu
                  saldo.
                </span>
              </span>
            </label>
          </>
        ) : (
          <Field label="Situação" htmlFor="status">
            <Select
              id="status"
              name="status"
              defaultValue={inicial?.status ?? "cleared"}
            >
              <option value="cleared">Já aconteceu</option>
              <option value="pending">Previsto</option>
            </Select>
          </Field>
        )}
      </Card>

      {/* Rateio */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Categoria</p>
            <p className="text-xs text-muted-foreground">
              {rateando
                ? "Divida o valor entre várias categorias."
                : "Um lançamento pode ser dividido em várias categorias."}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const ligando = !rateando;
              setRateando(ligando);
              if (ligando && linhas.length === 1) {
                setLinhas((ls) => [...ls, novaLinha()]);
              }
              if (!ligando) {
                setLinhas((ls) => [ls[0]]);
              }
            }}
          >
            <SplitSquareHorizontal className="size-4" />
            {rateando ? "Categoria única" : "Ratear"}
          </Button>
        </div>

        <div className="space-y-2">
          {(rateando ? linhas : [linhas[0]]).map((linha, i) => (
            <div key={linha.key} className="space-y-0">
              <div className="flex items-start gap-2">
                <div className="flex flex-1 gap-2">
                  <Select
                    aria-label={`Categoria ${i + 1}`}
                    value={linha.categoryId}
                    onChange={(e) =>
                      setLinhas((ls) =>
                        ls.map((l) =>
                          l.key === linha.key
                            ? { ...l, categoryId: e.target.value }
                            : l,
                        ),
                      )
                    }
                  >
                    <option value="">Selecione…</option>
                    {opcoes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                  <BotaoNovo
                    aberto={criandoCategoria === linha.key}
                    onClick={() =>
                      setCriandoCategoria((v) =>
                        v === linha.key ? null : linha.key,
                      )
                    }
                    rotulo={`Cadastrar nova categoria de ${tipo === "expense" ? "despesa" : "receita"}`}
                  />
                </div>

              {rateando && (
                <>
                  <div className="w-32">
                    <Input
                      aria-label={`Valor do rateio ${i + 1}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="tabular text-right"
                      value={linha.amount}
                      onChange={(e) =>
                        setLinhas((ls) =>
                          ls.map((l) =>
                            l.key === linha.key
                              ? { ...l, amount: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    aria-label={`Remover rateio ${i + 1}`}
                    disabled={linhas.length <= 1}
                    onClick={() =>
                      setLinhas((ls) => ls.filter((l) => l.key !== linha.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
              </div>

              <NovaCategoriaInline
                // Trocar despesa/receita invalida o grupo escolhido; remontar
                // pela key zera o painel sem precisar de um reset assíncrono.
                key={`${linha.key}-${tipo}`}
                aberto={criandoCategoria === linha.key}
                onFechar={() => setCriandoCategoria(null)}
                tipo={tipo}
                onCriada={(nova) => {
                  setCategorias((cs) => [...cs, nova]);
                  // Já seleciona na linha que pediu a criação.
                  setLinhas((ls) =>
                    ls.map((l) =>
                      l.key === linha.key ? { ...l, categoryId: nova.id } : l,
                    ),
                  );
                }}
              />
            </div>
          ))}
        </div>

        {rateando && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setLinhas((ls) => [...ls, novaLinha()])}
              >
                <Plus className="size-4" />
                Adicionar categoria
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={dividirIgualmente}
                disabled={totalCentavos <= 0}
              >
                Dividir igualmente
              </Button>
            </div>

            {/* O placar do rateio: sem ele o usuário só descobre o erro ao salvar. */}
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                diferenca === 0
                  ? "border-income/25 bg-income-subtle text-income"
                  : "border-warning/25 bg-xp-subtle text-warning",
              )}
              aria-live="polite"
            >
              <span className="font-medium">
                {diferenca === 0
                  ? "Rateio fecha com o valor"
                  : diferenca > 0
                    ? "Falta distribuir"
                    : "Passou do valor"}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular font-semibold">
                  {formatMoney(Math.abs(diferenca), moeda)}
                </span>
                {diferenca !== 0 && (
                  <button
                    type="button"
                    onClick={completarUltima}
                    className="rounded-md px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                  >
                    ajustar
                  </button>
                )}
              </span>
            </div>
          </>
        )}

        {state.splitError && <Alert>{state.splitError}</Alert>}
      </Card>

      <div className="flex items-center justify-end gap-3">
        {!podeEnviar && totalCentavos > 0 && rateando && diferenca !== 0 && (
          <p className="text-xs text-muted-foreground">
            Feche o rateio para salvar.
          </p>
        )}
        <SubmitButton label={editando ? "Salvar alterações" : "Salvar lançamento"} />
      </div>
    </form>
  );
}
