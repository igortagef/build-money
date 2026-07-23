import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { NewRachaForm } from "./form";

export const metadata = { title: "Novo racha · Build Money" };

export default async function NovoRachaPage() {
  const { ledgerId } = await requireAccess();

  const contas = await db
    .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
    .from(accounts)
    .where(
      and(
        eq(accounts.ledgerId, ledgerId),
        isNull(accounts.archivedAt),
        eq(accounts.isReimbursementPool, false),
      ),
    )
    .orderBy(asc(accounts.name));

  if (contas.length === 0) redirect("/contas/nova");

  // Categorias de despesa: a "minha parte" do racha vira uma despesa.
  const todas = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, "expense"),
        isNull(categories.archivedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const pais = new Map(todas.filter((c) => !c.parentId).map((c) => [c.id, c.name]));
  const cats = todas
    .map((c) => ({
      id: c.id,
      label: c.parentId ? `${pais.get(c.parentId) ?? ""} › ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-3">
        <Link
          href="/rachas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Rachas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Novo racha</h1>
        <p className="text-sm text-muted-foreground">
          Você pagou uma conta que outras pessoas vão dividir. Informe o total,
          quanto foi seu (vira despesa) e quem vai te reembolsar.
        </p>
      </div>

      <NewRachaForm
        contas={contas}
        categorias={cats}
        hoje={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
