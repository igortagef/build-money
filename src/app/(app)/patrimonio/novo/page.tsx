import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getTiposBemAtivos } from "@/lib/asset-kinds-db";
import { NewAssetForm } from "./form";

export const metadata = { title: "Adicionar ao patrimônio · Build Money" };

export default async function NovoAtivoPage() {
  const { ledgerId, baseCurrency } = await requireAccess();
  const tiposBem = await getTiposBemAtivos(ledgerId);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/patrimonio"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Patrimônio
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Adicionar ao patrimônio
        </h1>
        <p className="text-sm text-muted-foreground">
          Um investimento ou um bem. Para investimentos, informe o quanto
          aportou e o valor de hoje para acompanhar o rendimento.
        </p>
      </div>

      <NewAssetForm baseCurrency={baseCurrency} tiposBem={tiposBem} />
    </div>
  );
}
