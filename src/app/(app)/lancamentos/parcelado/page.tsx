import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { NewInstallmentForm } from "./form";

export const metadata = { title: "Compra parcelada · Build Money" };

export default async function ParceladoPage() {
  const { ledgerId } = await requireAccess();

  const contas = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      type: accounts.type,
      statementClosingDay: accounts.statementClosingDay,
      paymentDueDay: accounts.paymentDueDay,
    })
    .from(accounts)
    .where(and(
        eq(accounts.ledgerId, ledgerId),
        isNull(accounts.archivedAt),
        eq(accounts.isReimbursementPool, false),
      ))
    .orderBy(asc(accounts.name));

  if (contas.length === 0) redirect("/contas/nova");

  // Parcelamento é sempre despesa.
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
  const opcoes = todas
    .map((c) => ({
      id: c.id,
      label: c.parentId ? `${pais.get(c.parentId) ?? ""} › ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/lancamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Lançamentos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Compra parcelada
        </h1>
        <p className="text-sm text-muted-foreground">
          Uma compra no crédito ou boleto dividida em várias vezes. Cada parcela
          entra no mês em que pesa, para você ver quanto vai pagar mês a mês.
        </p>
      </div>

      <NewInstallmentForm
        contas={contas}
        categorias={opcoes}
        hoje={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
