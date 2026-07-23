import Link from "next/link";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, costCenters, transactionSplits } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { Card, cn } from "@/components/ui";
import { GerenciadorDeCategorias } from "./manager";
import type { CategoryType } from "@/db/schema";

export const metadata = { title: "Categorias · Build Money" };

export type CategoriaNode = {
  id: string;
  nome: string;
  costCenterId: string | null;
  costCenterNome: string | null;
  arquivada: boolean;
  padrao: boolean;
  usos: number;
  filhos: Omit<CategoriaNode, "filhos">[];
};

async function carregar(ledgerId: string, tipo: CategoryType, verArquivadas: boolean) {
  const linhas = await db
    .select({
      id: categories.id,
      nome: categories.name,
      parentId: categories.parentId,
      costCenterId: categories.costCenterId,
      costCenterNome: costCenters.name,
      archivedAt: categories.archivedAt,
      padrao: categories.isDefault,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .leftJoin(costCenters, eq(categories.costCenterId, costCenters.id))
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, tipo),
        verArquivadas ? undefined : isNull(categories.archivedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  // Quantos lançamentos usam cada categoria: é o que decide entre apagar e
  // arquivar, então a tela precisa saber antes de oferecer o botão.
  // O join com `categories` limita a contagem a este espaço — sem ele a
  // consulta varreria os rateios de todos os usuários.
  const contagem = await db
    .select({
      categoryId: transactionSplits.categoryId,
      n: count(),
    })
    .from(transactionSplits)
    .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(eq(categories.ledgerId, ledgerId))
    .groupBy(transactionSplits.categoryId);

  const usoPor = new Map(contagem.map((c) => [c.categoryId!, c.n]));

  const raizes = linhas.filter((l) => !l.parentId);

  return raizes.map((r) => ({
    id: r.id,
    nome: r.nome,
    costCenterId: r.costCenterId,
    costCenterNome: r.costCenterNome,
    arquivada: !!r.archivedAt,
    padrao: r.padrao,
    usos: usoPor.get(r.id) ?? 0,
    filhos: linhas
      .filter((l) => l.parentId === r.id)
      .map((f) => ({
        id: f.id,
        nome: f.nome,
        costCenterId: f.costCenterId,
        costCenterNome: f.costCenterNome,
        arquivada: !!f.archivedAt,
        padrao: f.padrao,
        usos: usoPor.get(f.id) ?? 0,
      })),
  }));
}

export default async function CategoriasPage(props: {
  searchParams: Promise<{ arquivadas?: string }>;
}) {
  const { arquivadas } = await props.searchParams;
  const verArquivadas = arquivadas === "1";

  const { ledgerId } = await requireAccess();

  const [despesas, receitas, centros] = await Promise.all([
    carregar(ledgerId, "expense", verArquivadas),
    carregar(ledgerId, "income", verArquivadas),
    db
      .select({ id: costCenters.id, nome: costCenters.name })
      .from(costCenters)
      .where(
        and(eq(costCenters.ledgerId, ledgerId), isNull(costCenters.archivedAt)),
      )
      .orderBy(asc(costCenters.name)),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            Os planos de receita e despesa são independentes. Tudo aqui é seu —
            renomeie, crie e arquive o que quiser.
          </p>
        </div>

        <Link
          href={verArquivadas ? "/categorias" : "/categorias?arquivadas=1"}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            verArquivadas
              ? "border-primary-border bg-primary-subtle text-primary-text"
              : "border-border text-muted-foreground hover:border-border-strong",
          )}
        >
          {verArquivadas ? "Ocultar arquivadas" : "Ver arquivadas"}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GerenciadorDeCategorias
          titulo="Despesas"
          tipo="expense"
          grupos={despesas}
          centros={centros}
        />
        <GerenciadorDeCategorias
          titulo="Receitas"
          tipo="income"
          grupos={receitas}
          centros={centros}
        />
      </div>

      {despesas.length === 0 && receitas.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma categoria
          {verArquivadas ? "" : " ativa"}. Crie a primeira acima.
        </Card>
      )}
    </div>
  );
}
