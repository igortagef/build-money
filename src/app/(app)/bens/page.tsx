import Link from "next/link";
import { requireAccess } from "@/lib/auth";
import { getTiposBem } from "@/lib/asset-kinds-db";
import { GerenciadorTiposBem } from "./manager";

export const metadata = { title: "Tipos de bem · Build Money" };

export default async function BensPage() {
  const { ledgerId } = await requireAccess();
  const tipos = await getTiposBem(ledgerId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tipos de bem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A lista de tipos que aparece ao cadastrar um bem no{" "}
          <Link href="/patrimonio" className="underline">patrimônio</Link>. Crie os
          seus — joias, terreno, máquina, o que você tiver — e o seletor do
          cadastro passa a oferecê-los.
        </p>
      </div>

      <GerenciadorTiposBem tipos={tipos} />
    </div>
  );
}
