import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { NewRecurringForm } from "./form";

export const metadata = { title: "Nova conta fixa · Build Money" };

export default async function NovaFixaPage() {
  const { ledgerId, baseCurrency } = await requireAccess();

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
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/contas-fixas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Contas fixas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nova conta fixa</h1>
      </div>

      <NewRecurringForm
        contas={contas}
        categorias={opcoes}
        baseCurrency={baseCurrency}
        hoje={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
