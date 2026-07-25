import Link from "next/link";
import { CalendarClock, Pencil, Plus, Repeat, Table, Upload } from "lucide-react";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  categories,
  costCenters,
  transactions,
  transactionSplits,
} from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { monthRange } from "@/lib/queries";
import { formatarDataBR } from "@/lib/periodo";
import { buttonClasses, Card, cn } from "@/components/ui";
import { DeleteButton } from "./delete-button";
import { ReconcileButton } from "./reconcile-button";
import { ConfirmButton } from "./confirm-button";
import { TransferDeleteButton } from "./transfer-delete-button";
import { Filtros } from "./filters";

export const metadata = { title: "Lançamentos · Build Money" };

const MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

/** Aceita ?conta=a&conta=b — e também o caso de um valor só. */
function comoLista(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function LancamentosPage(props: {
  searchParams: Promise<{
    mes?: string;
    tipo?: string;
    conta?: string | string[];
    categoria?: string | string[];
    centro?: string | string[];
    de?: string;
    ate?: string;
    regime?: string;
    status?: string;
  }>;
}) {
  // No Next 16 searchParams é uma Promise.
  const sp = await props.searchParams;
  const { mes, tipo } = sp;
  const contasFiltro = comoLista(sp.conta);
  const categoriasFiltro = comoLista(sp.categoria);
  const centrosFiltro = comoLista(sp.centro);

  // Modo intervalo: quando vem `de`/`ate` (rastreio a partir dos relatórios),
  // a lista cobre o período exato, no regime informado, em vez do mês.
  const rangeMode = ISO_DATA.test(sp.de ?? "") && ISO_DATA.test(sp.ate ?? "");
  const regime: "competencia" | "caixa" = sp.regime === "caixa" ? "caixa" : "competencia";

  const { ledgerId, baseCurrency } = await requireAccess();

  // Receitas previstas: entradas ainda não realizadas, de hoje em diante. Ficam
  // fora do recorte por mês (apontam para o futuro) e só aparecem na aba
  // "Receitas" — é ali, em Lançamentos › Receitas, que elas vivem.
  const hojeStr = new Date().toISOString().slice(0, 10);
  const receitasPrevistas =
    tipo === "income"
      ? await db
          .select({
            id: transactions.id,
            description: transactions.description,
            amount: transactions.amount,
            currency: transactions.currency,
            date: transactions.date,
            accountName: accounts.name,
            recorrente: sql<boolean>`${transactions.recurringRuleId} is not null`,
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(
            and(
              eq(transactions.ledgerId, ledgerId),
              eq(transactions.type, "income"),
              eq(transactions.status, "pending"),
              gte(transactions.date, hojeStr),
            ),
          )
          .orderBy(asc(transactions.date))
          .limit(20)
      : [];

  const referencia = mes ? new Date(`${mes}-01T12:00:00`) : new Date();
  const { start, end } = rangeMode
    ? { start: sp.de!, end: sp.ate! }
    : monthRange(referencia);

  // No modo intervalo em regime de caixa, filtra pela data de caixa (a fatura do
  // cartão conta no vencimento) — batendo com o que o relatório somou.
  const colData =
    rangeMode && regime === "caixa"
      ? sql`coalesce(${transactions.settlementDate}, ${transactions.date})`
      : transactions.date;

  const filtros = [
    eq(transactions.ledgerId, ledgerId),
    sql`${colData} >= ${start}`,
    sql`${colData} <= ${end}`,
    // Parcelas reparceladas ficam só no histórico da fatura, fora da lista.
    sql`${transactions.supersededByPlanId} is null`,
  ];

  // Filtro de situação: "vencidas" = previsto cuja data já passou (o que o card
  // de Vencimentos mostra); "previstos" = tudo que ainda não foi confirmado.
  const hoje = new Date().toISOString().slice(0, 10);
  if (sp.status === "vencidas") {
    filtros.push(eq(transactions.status, "pending"));
    filtros.push(sql`${transactions.date} < ${hoje}`);
  } else if (sp.status === "previstos") {
    filtros.push(eq(transactions.status, "pending"));
  } else if (sp.status === "conferir") {
    filtros.push(eq(transactions.status, "cleared"));
  }
  if (tipo === "income" || tipo === "expense") {
    filtros.push(eq(transactions.type, tipo));
  }
  if (contasFiltro.length > 0) {
    filtros.push(inArray(transactions.accountId, contasFiltro));
  }

  /*
   * Categoria e centro de custo filtram por EXISTS, não pelo join da consulta.
   *
   * Se filtrassem pelo join, um lançamento rateado entre Supermercado e
   * Cosméticos, filtrado por Supermercado, apareceria dizendo "1 categoria" e
   * escondendo Cosméticos — o lançamento mostrado seria diferente do real.
   * Com EXISTS, o lançamento entra inteiro e continua listando as duas.
   */
  if (categoriasFiltro.length > 0) {
    filtros.push(
      sql`exists (
        select 1 from ${transactionSplits} ts
        where ts.transaction_id = ${transactions.id}
          and ts.category_id in ${categoriasFiltro}
      )`,
    );
  }
  if (centrosFiltro.length > 0) {
    // O centro do rateio manda; sem ele, vale o herdado da categoria.
    filtros.push(
      sql`exists (
        select 1 from ${transactionSplits} ts
        join ${categories} c on c.id = ts.category_id
        where ts.transaction_id = ${transactions.id}
          and coalesce(ts.cost_center_id, c.cost_center_id) in ${centrosFiltro}
      )`,
    );
  }

  // Opções dos filtros: só o que existe neste espaço.
  const [contasOpc, categoriasOpc, centrosOpc] = await Promise.all([
    db
      .select({ id: accounts.id, label: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.ledgerId, ledgerId), isNull(accounts.archivedAt)))
      .orderBy(asc(accounts.name)),
    db
      .select({
        id: categories.id,
        nome: categories.name,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(
        and(eq(categories.ledgerId, ledgerId), isNull(categories.archivedAt)),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ id: costCenters.id, label: costCenters.name })
      .from(costCenters)
      .where(
        and(
          eq(costCenters.ledgerId, ledgerId),
          isNull(costCenters.archivedAt),
        ),
      )
      .orderBy(asc(costCenters.name)),
  ]);

  const nomePai = new Map(
    categoriasOpc.filter((c) => !c.parentId).map((c) => [c.id, c.nome]),
  );
  const categoriasLista = categoriasOpc
    .map((c) => ({
      id: c.id,
      label: c.parentId ? `${nomePai.get(c.parentId) ?? ""} › ${c.nome}` : c.nome,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const linhas = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      amountBase: transactions.amountBase,
      currency: transactions.currency,
      type: transactions.type,
      status: transactions.status,
      date: transactions.date,
      transferPairId: transactions.transferPairId,
      accountName: accounts.name,
      // Uma linha por lançamento: as categorias do rateio vêm agregadas.
      categorias: sql<string[]>`coalesce(
        array_agg(${categories.name} order by ${transactionSplits.sortOrder})
          filter (where ${categories.name} is not null),
        '{}'
      )`,
      qtdRateios: sql<number>`count(${transactionSplits.id})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(
      transactionSplits,
      eq(transactionSplits.transactionId, transactions.id),
    )
    .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(and(...filtros))
    .groupBy(transactions.id, accounts.name)
    .orderBy(desc(transactions.date), desc(transactions.createdAt));

  // Transferências cujas pernas tocam uma piscina (aporte/resgate, racha) não
  // podem ser apagadas soltas na lista — isso deixaria o ativo/racha inflado.
  // Elas se gerenciam no Patrimônio/Rachas; aqui só escondemos o botão.
  const pares = [...new Set(linhas.map((l) => l.transferPairId).filter(Boolean) as string[])];
  const paresPiscina = pares.length
    ? new Set(
        (
          await db
            .selectDistinct({ par: transactions.transferPairId })
            .from(transactions)
            .innerJoin(accounts, eq(accounts.id, transactions.accountId))
            .where(
              and(
                eq(transactions.ledgerId, ledgerId),
                inArray(transactions.transferPairId, pares),
                or(
                  eq(accounts.isInvestmentPool, true),
                  eq(accounts.isReimbursementPool, true),
                ),
              ),
            )
        ).map((r) => r.par),
      )
    : new Set<string>();

  const receitas = linhas
    .filter((l) => l.type === "income" && l.status !== "pending")
    .reduce((s, l) => s + l.amountBase, 0);
  const despesas = linhas
    .filter((l) => l.type === "expense" && l.status !== "pending")
    .reduce((s, l) => s + l.amountBase, 0);

  const mesAtual = start.slice(0, 7);
  const anterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  const proximo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const rotulo = MES.format(referencia);
  const titulo = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);

  /**
   * Monta a URL trocando só o que mudou e preservando o resto — sem isso,
   * avançar um mês descartaria os filtros que o usuário acabou de escolher. No
   * modo intervalo (rastreio dos relatórios), preserva de/até/regime.
   */
  function url(mudancas: { mes?: string; tipo?: string | null; status?: string | null }) {
    const p = new URLSearchParams();
    if (rangeMode) {
      p.set("de", sp.de!);
      p.set("ate", sp.ate!);
      if (regime === "caixa") p.set("regime", "caixa");
    } else {
      p.set("mes", mudancas.mes ?? mesAtual);
    }

    const novoTipo = "tipo" in mudancas ? mudancas.tipo : tipo;
    if (novoTipo) p.set("tipo", novoTipo);
    const novoStatus = "status" in mudancas ? mudancas.status : sp.status;
    if (novoStatus) p.set("status", novoStatus);

    for (const c of contasFiltro) p.append("conta", c);
    for (const c of categoriasFiltro) p.append("categoria", c);
    for (const c of centrosFiltro) p.append("centro", c);

    return `/lancamentos?${p.toString()}`;
  }

  const totalFiltros =
    contasFiltro.length + categoriasFiltro.length + centrosFiltro.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Lançamentos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/lancamentos/lote" className={buttonClasses("secondary")}>
            <Table className="size-4" />
            Em lote
          </Link>
          <Link href="/conciliacao" className={buttonClasses("secondary")}>
            <Upload className="size-4" />
            Importar
          </Link>
          <Link href="/lancamentos/novo" className={buttonClasses()}>
            <Plus className="size-4" />
            Novo lançamento
          </Link>
        </div>
      </div>

      {/* Situação: filtra por realizado/previsto sem sair da tela. Também é o
          destino dos atalhos do painel (conta vencida, "a conferir"). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Situação</span>
        {(
          [
            { v: null, label: "Todas" },
            { v: "vencidas", label: "Vencidas" },
            { v: "previstos", label: "Previstos" },
            { v: "conferir", label: "A conferir" },
          ] as const
        ).map(({ v, label }) => {
          const ativo = (sp.status ?? null) === v;
          return (
            <Link
              key={label}
              href={url({ status: v })}
              aria-current={ativo ? "true" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                ativo
                  ? v === "vencidas"
                    ? "bg-expense-subtle text-expense"
                    : "bg-primary-subtle text-primary-text"
                  : "text-muted-foreground hover:bg-surface-muted",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rangeMode ? (
          // Rastreio a partir de um relatório: mostra o período e um botão para
          // sair dele (voltar à navegação por mês).
          <>
            <span className="rounded-lg bg-primary-subtle px-3 py-1.5 text-sm font-medium text-primary-text">
              {formatarDataBR(sp.de!)} – {formatarDataBR(sp.ate!)}
              {regime === "caixa" ? " · caixa" : ""}
            </span>
            <Link href="/lancamentos" className={buttonClasses("ghost", "sm")}>
              Limpar período
            </Link>
          </>
        ) : (
          <>
            <Link href={url({ mes: iso(anterior) })} className={buttonClasses("secondary", "sm")}>
              ‹ Anterior
            </Link>
            <span className="min-w-40 text-center text-sm font-medium">{titulo}</span>
            <Link href={url({ mes: iso(proximo) })} className={buttonClasses("secondary", "sm")}>
              Próximo ›
            </Link>
          </>
        )}

        <div className="ml-auto flex gap-1">
          {(
            [
              { v: null, label: "Tudo" },
              { v: "income", label: "Receitas" },
              { v: "expense", label: "Despesas" },
            ] as const
          ).map(({ v, label }) => (
            <Link
              key={label}
              href={url({ tipo: v })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                (tipo ?? null) === v
                  ? "bg-primary-subtle text-primary-text"
                  : "text-muted-foreground hover:bg-surface-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <Filtros
        contas={contasOpc}
        categorias={categoriasLista}
        centros={centrosOpc}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo label="Receitas" valor={formatMoney(receitas, baseCurrency)} tom="income" />
        <Resumo label="Despesas" valor={formatMoney(despesas, baseCurrency)} tom="expense" />
        <Resumo
          label="Resultado"
          valor={formatMoney(receitas - despesas, baseCurrency)}
          tom={receitas - despesas >= 0 ? "income" : "expense"}
        />
      </div>

      <ReceitasPrevistas itens={receitasPrevistas} baseCurrency={baseCurrency} />

      {linhas.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {/*
              Com filtro ativo, "nenhum lançamento" é ambíguo: pode ser que o
              mês esteja vazio ou que o filtro tenha escondido tudo. Dizer qual
              é o caso evita o susto de achar que os dados sumiram.
            */}
            {totalFiltros > 0
              ? `Nenhum lançamento em ${titulo.toLowerCase()} com os filtros aplicados.`
              : `Nenhum lançamento em ${titulo.toLowerCase()}.`}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {linhas.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(`${l.date}T12:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })}
                  {" · "}
                  {l.accountName}
                  {l.categorias.length > 0 && ` · ${l.categorias.join(", ")}`}
                  {l.status === "pending" && " · previsto"}
                  {l.status === "reconciled" && " · conferido"}
                </p>
              </div>

              {l.qtdRateios > 1 && (
                <span className="shrink-0 rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] font-medium text-primary-text">
                  {l.qtdRateios} categorias
                </span>
              )}

              <p
                className={cn(
                  "tabular shrink-0 font-semibold",
                  l.type === "income" && "text-income",
                  l.type === "expense" && "text-expense",
                  // Transferência é neutra: não é ganho nem perda, só troca de
                  // lugar. O sinal vem direto do amount (negativo = saiu).
                  l.type === "transfer" && "text-muted-foreground",
                  l.status === "pending" && "opacity-60",
                )}
              >
                {l.type === "transfer"
                  ? `${l.amount < 0 ? "−" : "+"} ${formatMoney(Math.abs(l.amount), l.currency)}`
                  : `${l.type === "expense" ? "−" : "+"} ${formatMoney(l.amount, l.currency)}`}
              </p>

              {l.type === "transfer" ? (
                // Transferência não se edita nem concilia peça a peça: apagar
                // remove as duas pernas juntas. Exceto aporte/resgate/racha
                // (tocam piscina): esses se gerenciam no Patrimônio/Rachas, para
                // não deixar o ativo órfão — aqui não mostramos o botão.
                paresPiscina.has(l.transferPairId!) ? null : (
                  <TransferDeleteButton
                    pairId={l.transferPairId!}
                    descricao={l.description}
                  />
                )
              ) : (
                <>
                  {/* Previsto se confirma; realizado se concilia. São etapas
                      diferentes da vida do lançamento, e o botão muda junto. */}
                  {l.status === "pending" ? (
                    <ConfirmButton id={l.id} descricao={l.description} />
                  ) : (
                    <ReconcileButton
                      id={l.id}
                      descricao={l.description}
                      conciliado={l.status === "reconciled"}
                      previsto={false}
                    />
                  )}
                  <Link
                    href={`/lancamentos/${l.id}/editar`}
                    aria-label={`Editar ${l.description}`}
                    title="Editar"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Link>
                  <DeleteButton id={l.id} descricao={l.description} />
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Resumo({
  label,
  valor,
  tom,
}: {
  label: string;
  valor: string;
  tom: "income" | "expense";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-lg font-semibold",
          tom === "income" ? "text-income" : "text-expense",
        )}
      >
        {valor}
      </p>
    </Card>
  );
}

/**
 * Card das receitas previstas dentro da seção de lançamentos. Elas são futuras,
 * então não caem no recorte do mês exibido; mostrá-las aqui evita que o previsto
 * a receber fique escondido até virar o mês.
 */
function ReceitasPrevistas({
  itens,
  baseCurrency,
}: {
  itens: Array<{
    id: string;
    description: string;
    amount: number;
    currency: "BRL" | "USD" | "EUR";
    date: string;
    accountName: string;
    recorrente: boolean;
  }>;
  baseCurrency: "BRL" | "USD" | "EUR";
}) {
  if (itens.length === 0) return null;
  const total = itens.reduce((s, i) => s + i.amount, 0);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-income" />
          <h2 className="text-sm font-semibold text-muted-foreground">
            Receitas previstas
          </h2>
          <span className="tabular text-sm font-semibold text-income">
            {formatMoney(total, baseCurrency)}
          </span>
        </div>
        <Link
          href="/receitas-previstas"
          className="text-xs font-medium text-primary-text hover:underline"
        >
          Gerenciar
        </Link>
      </div>

      <Card className="divide-y divide-border">
        {itens.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {i.description}
                {i.recorrente && (
                  <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="recorrente" />
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(`${i.date}T12:00:00`).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {" · "}
                {i.accountName}
                {" · previsto"}
              </p>
            </div>
            <p className="tabular shrink-0 text-sm font-semibold text-income">
              + {formatMoney(i.amount, i.currency)}
            </p>
          </div>
        ))}
      </Card>
    </section>
  );
}
