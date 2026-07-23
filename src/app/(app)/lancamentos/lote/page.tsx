import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { BatchGrid } from "./grid";

export const metadata = { title: "Lançamento em lote · Build Money" };

export default async function LotePage() {
  const { ledgerId } = await requireAccess();

  const contas = await db
    .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
    .from(accounts)
    .where(and(
        eq(accounts.ledgerId, ledgerId),
        isNull(accounts.archivedAt),
        eq(accounts.isReimbursementPool, false),
      ))
    .orderBy(asc(accounts.name));

  if (contas.length === 0) redirect("/contas/nova");

  const todas = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), isNull(categories.archivedAt)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const pais = new Map(todas.filter((c) => !c.parentId).map((c) => [c.id, c.name]));
  const opcoes = todas
    .map((c) => ({
      id: c.id,
      type: c.type,
      label: c.parentId ? `${pais.get(c.parentId) ?? ""} › ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/lancamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Lançamentos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Lançamento em lote
        </h1>
        <p className="text-sm text-muted-foreground">
          Vários lançamentos de uma vez, como numa planilha. Digite linha a
          linha ou cole direto do Excel. Para ajustar um depois, use a edição
          normal na lista.
        </p>
      </div>

      <BatchGrid
        contas={contas}
        categorias={opcoes}
        hoje={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
